"""Diffusion-Lab GPU pod server: WebRTC in, StreamDiffusion out.

One browser session at a time (v1). The browser publishes its canvas/camera track with
a WHIP-style POST and receives the AI output on the same peer connection:

  GET    /health                  {"ready": bool, "stage": str}       (no auth; polled by api/runpod.php)
  POST   /whip                    SDP offer (application/sdp) -> 201 SDP answer, Location: /whip/<id>
  DELETE /whip/<id>               end the session
  POST   /params                  JSON stream params (Daydream-style, see apply_params) -> 200

Every request except /health needs "Authorization: Bearer <token>", the HMAC token that
api/runpod.php issues (v1.<payload>.<sig>, payload {"pod", "exp"}), signed with
TOKEN_SECRET and bound to this pod's RUNPOD_POD_ID.

The pod terminates itself through the RunPod API when nobody has used it for
IDLE_MINUTES, and in any case MAX_SESSION_MINUTES after boot. RunPod injects
RUNPOD_POD_ID and RUNPOD_API_KEY into every pod.

Env: TOKEN_SECRET (required), ALLOWED_ORIGINS (default https://diffusionlab.de,
https://www.diffusionlab.de), PORT (8000), IDLE_MINUTES (5), MAX_SESSION_MINUTES (60),
ICE_SERVERS (JSON list of {"urls", "username"?, "credential"?}; default Google STUN),
SD_CONFIG (StreamDiffusion YAML, default /app/config.yaml; "{gpu}" in its engine_dir becomes
the GPU model, e.g. /workspace/engines/nvidia-geforce-rtx-4090, because TensorRT engines are
built for one GPU type), DISABLE_SELF_STOP=1 for tests.
"""
import asyncio
import base64
import hashlib
import hmac
import io
import ipaddress
import json
import logging
import os
import re
import socket
import threading
import time
import uuid
import warnings
from fractions import Fraction
from urllib.parse import urlparse

import numpy as np
from aiohttp import ClientSession, ClientTimeout, web
from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamError, VideoStreamTrack
from av import VideoFrame

# diffusers warns on every frame about the [-1, 1] tensor range StreamDiffusion hands it
warnings.filterwarnings("ignore", category=FutureWarning, module="diffusers")

log = logging.getLogger("pod")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

TOKEN_SECRET = os.environ.get("TOKEN_SECRET", "").encode()
POD_ID = os.environ.get("RUNPOD_POD_ID", "local")
ALLOWED_ORIGINS = {
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "https://diffusionlab.de,https://www.diffusionlab.de").split(",")
    if o.strip()
}
PORT = int(os.environ.get("PORT", "8000"))
IDLE_SECONDS = 60 * float(os.environ.get("IDLE_MINUTES", "5"))
MAX_SECONDS = 60 * float(os.environ.get("MAX_SESSION_MINUTES", "60"))
SD_CONFIG = os.environ.get("SD_CONFIG", "/app/config.yaml")
MAX_SDP_BYTES = 64 * 1024
MAX_PARAMS_BYTES = 256 * 1024
MAX_STYLE_IMAGE_BYTES = 5 * 1024 * 1024

BOOT = time.monotonic()
state = {"ready": False, "stage": "starting", "last_activity": time.monotonic()}
sessions = {}  # id -> RTCPeerConnection


# --- auth ---------------------------------------------------------------------------

def b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def token_ok(header: str) -> bool:
    if not TOKEN_SECRET or not header.startswith("Bearer "):
        return False
    parts = header[7:].strip().split(".")
    if len(parts) != 3 or parts[0] != "v1":
        return False
    expected = hmac.new(TOKEN_SECRET, f"v1.{parts[1]}".encode(), hashlib.sha256).digest()
    try:
        if not hmac.compare_digest(expected, b64url_decode(parts[2])):
            return False
        payload = json.loads(b64url_decode(parts[1]))
    except (ValueError, json.JSONDecodeError):
        return False
    return payload.get("pod") == POD_ID and isinstance(payload.get("exp"), int) and payload["exp"] > time.time()


@web.middleware
async def cors_and_auth(request: web.Request, handler):
    origin = request.headers.get("Origin", "")
    cors = {}
    if origin in ALLOWED_ORIGINS:
        cors = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Expose-Headers": "Location",
            "Access-Control-Max-Age": "600",
            "Vary": "Origin",
        }
    if request.method == "OPTIONS":
        return web.Response(status=204 if cors else 403, headers=cors)
    if request.path != "/health":
        if origin and origin not in ALLOWED_ORIGINS:
            return web.json_response({"error": "origin not allowed"}, status=403)
        if not token_ok(request.headers.get("Authorization", "")):
            return web.json_response({"error": "unauthorized"}, status=401, headers=cors)
        state["last_activity"] = time.monotonic()
    try:
        response = await handler(request)
    except web.HTTPException as exc:
        exc.headers.update(cors)
        raise
    response.headers.update(cors)
    return response


# --- inference ----------------------------------------------------------------------

class Engine:
    """Runs StreamDiffusion on its own thread: newest input frame in, newest output out."""

    def __init__(self):
        self.wrapper = None
        self.lock = threading.Lock()
        self.input = None          # newest np.ndarray (H, W, 3) RGB uint8
        self.output = None         # newest np.ndarray (H, W, 3) RGB uint8
        self.new_input = threading.Event()
        self.pending_params = None
        self.width = self.height = 512

    def load(self):
        import torch  # imported here so /health answers while torch loads
        from streamdiffusion import create_wrapper_from_config, load_config

        config = load_config(SD_CONFIG)
        config["output_type"] = "np"
        gpu = re.sub(r"[^a-z0-9]+", "-", torch.cuda.get_device_name().lower()).strip("-")
        engine_dir = str(config.get("engine_dir", "/workspace/engines/{gpu}")).replace("{gpu}", gpu)
        config["engine_dir"] = engine_dir
        has_engines = any(name.endswith(".engine") for _, _, files in os.walk(engine_dir) for name in files)
        state["stage"] = "loading models" if has_engines else "building engines (first start on this GPU, about 15 min)"
        log.info("GPU %s, engines in %s (%s)", gpu, engine_dir, "cached" if has_engines else "building")
        self.width, self.height = config.get("width", 512), config.get("height", 512)
        self.wrapper = create_wrapper_from_config(config)
        # One warm-up frame so the first visitor doesn't pay for lazy initialisation
        from PIL import Image

        self.wrapper(image=Image.new("RGB", (self.width, self.height)))
        state.update(ready=True, stage="ready", last_activity=time.monotonic())  # idle clock starts now
        log.info("models loaded in %.0fs", time.monotonic() - BOOT)

    def submit(self, rgb: np.ndarray):
        with self.lock:
            self.input = rgb
        self.new_input.set()

    def run(self):
        from PIL import Image

        while True:
            self.new_input.wait()
            self.new_input.clear()
            with self.lock:
                frame, self.input = self.input, None
                params, self.pending_params = self.pending_params, None
            if params:
                try:
                    self.wrapper.update_stream_params(**params)
                except Exception:  # bad params must not kill the stream
                    log.exception("update_stream_params failed")
            if frame is None:
                continue
            image = Image.fromarray(frame).resize((self.width, self.height))
            result = self.wrapper(image=image)
            out = np.asarray(result[0] if isinstance(result, (list, tuple)) else result)
            if out.ndim == 4:
                out = out[0]
            if out.dtype != np.uint8:
                out = (np.clip(out, 0, 1) * 255).astype(np.uint8)
            with self.lock:
                self.output = out

    def latest_output(self):
        with self.lock:
            return self.output


engine = Engine()

# Daydream-style params -> wrapper.update_stream_params keyword arguments
PARAM_MAP = {
    "prompt": None,  # handled below (prompt_list)
    "negative_prompt": "negative_prompt",
    "num_inference_steps": "num_inference_steps",
    "guidance_scale": "guidance_scale",
    "delta": "delta",
    "t_index_list": "t_index_list",
    "seed": "seed",
    "controlnets": "controlnet_config",
    "cache_maxframes": "cache_maxframes",
    "cache_interval": "cache_interval",
    "prompt_interpolation_method": "prompt_interpolation_method",
    "seed_interpolation_method": "seed_interpolation_method",
    "normalize_prompt_weights": "normalize_prompt_weights",
    "normalize_seed_weights": "normalize_seed_weights",
}


def to_wrapper_params(params: dict) -> dict:
    out = {}
    for key, value in params.items():
        target = PARAM_MAP.get(key)
        if target:
            out[target] = value
    if isinstance(params.get("prompt"), str):
        out["prompt_list"] = [(params["prompt"], 1.0)]
    return out


style_cache = {"url": None, "image": None}


def public_https_url(url: str) -> bool:
    """Only fetch https URLs that resolve to public addresses (no RunPod-internal hosts)."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(parsed.hostname, parsed.port or 443)}
    except socket.gaierror:
        return False
    return all(ipaddress.ip_address(a).is_global for a in addresses)


async def fetch_style_image(url: str):
    """Downloads the style image once per URL (the page resends all params on every change)."""
    from PIL import Image

    if style_cache["url"] == url:
        return style_cache["image"]
    if not await asyncio.get_running_loop().run_in_executor(None, public_https_url, url):
        raise ValueError("style image URL must be public https")
    async with ClientSession(timeout=ClientTimeout(total=15)) as http:
        async with http.get(url, allow_redirects=False) as response:
            if response.status != 200 or not response.content_type.startswith("image/"):
                raise ValueError(f"style image fetch failed: HTTP {response.status}")
            data = await response.content.read(MAX_STYLE_IMAGE_BYTES + 1)
    if len(data) > MAX_STYLE_IMAGE_BYTES:
        raise ValueError("style image too large")
    image = Image.open(io.BytesIO(data)).convert("RGB")
    style_cache.update(url=url, image=image)
    return image


# --- WebRTC -------------------------------------------------------------------------

class OutputTrack(VideoStreamTrack):
    """Sends the newest AI frame at a steady rate (repeats the last one if nothing new)."""

    kind = "video"

    def __init__(self, fps: int = 30):
        super().__init__()
        self.frame_time = 1 / fps
        self.pts = 0
        self.started = None

    async def recv(self):
        if self.started is None:
            self.started = time.monotonic()
        self.pts += 1
        wait = self.started + self.pts * self.frame_time - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        image = engine.latest_output()
        if image is None:
            image = np.zeros((engine.height, engine.width, 3), dtype=np.uint8)
        frame = VideoFrame.from_ndarray(image, format="rgb24")
        frame.pts = self.pts
        frame.time_base = Fraction(1, round(1 / self.frame_time))
        return frame


async def consume(track):
    """Feeds the browser's video into the engine, dropping frames the GPU can't keep up with."""
    try:
        while True:
            frame = await track.recv()
            engine.submit(frame.to_ndarray(format="rgb24"))
    except MediaStreamError:
        pass


def ice_servers():
    raw = os.environ.get("ICE_SERVERS")
    servers = json.loads(raw) if raw else [{"urls": "stun:stun.l.google.com:19302"}]
    return [RTCIceServer(**s) for s in servers]


async def close_session(session_id: str):
    pc = sessions.pop(session_id, None)
    if pc:
        await pc.close()
        log.info("session %s closed", session_id)


async def whip_post(request: web.Request):
    if not state["ready"]:
        return web.json_response({"error": "still loading"}, status=503)
    if request.content_length and request.content_length > MAX_SDP_BYTES:
        return web.json_response({"error": "offer too large"}, status=413)
    offer = await request.text()
    if "m=video" not in offer:
        return web.json_response({"error": "expected an SDP offer with video"}, status=400)
    for existing in list(sessions):  # v1: one session; a new one replaces the old
        await close_session(existing)

    session_id = uuid.uuid4().hex
    pc = RTCPeerConnection(RTCConfiguration(iceServers=ice_servers()))
    sessions[session_id] = pc
    output = OutputTrack()

    @pc.on("track")
    def on_track(track):
        if track.kind == "video":
            asyncio.ensure_future(consume(track))

    @pc.on("connectionstatechange")
    async def on_state():
        log.info("session %s: %s", session_id, pc.connectionState)
        if pc.connectionState in ("failed", "closed"):
            await close_session(session_id)

    await pc.setRemoteDescription(RTCSessionDescription(sdp=offer, type="offer"))
    for transceiver in pc.getTransceivers():
        if transceiver.kind == "video":
            transceiver.sender.replaceTrack(output)
            transceiver.direction = "sendrecv"
    if not any(t.sender.track for t in pc.getTransceivers()):
        pc.addTrack(output)
    await pc.setLocalDescription(await pc.createAnswer())  # aiortc gathers all candidates here
    return web.Response(
        status=201,
        text=pc.localDescription.sdp,
        content_type="application/sdp",
        headers={"Location": f"/whip/{session_id}"},
    )


async def whip_delete(request: web.Request):
    await close_session(request.match_info["session_id"])
    return web.Response(status=200)


async def params_post(request: web.Request):
    if request.content_length and request.content_length > MAX_PARAMS_BYTES:
        return web.json_response({"error": "params too large"}, status=413)
    try:
        params = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "invalid JSON"}, status=400)
    if not isinstance(params, dict):
        return web.json_response({"error": "expected an object"}, status=400)
    wrapper_params = to_wrapper_params(params)
    style_url = params.get("ip_adapter_style_image_url")
    if isinstance(params.get("ip_adapter"), dict):
        ip_config = dict(params["ip_adapter"])
        if isinstance(style_url, str) and style_url:
            try:
                ip_config["style_image"] = await fetch_style_image(style_url)
            except (ValueError, OSError) as exc:
                return web.json_response({"error": str(exc)}, status=400)
        wrapper_params["ipadapter_config"] = ip_config
    with engine.lock:
        engine.pending_params = {**(engine.pending_params or {}), **wrapper_params}
    engine.new_input.set()
    return web.json_response({"ok": True, "applied": sorted(wrapper_params)})


async def health(_request: web.Request):
    return web.json_response({"ready": state["ready"], "stage": state["stage"]})


# --- self-stop ----------------------------------------------------------------------

async def terminate_self(reason: str):
    log.warning("terminating this pod: %s", reason)
    if os.environ.get("DISABLE_SELF_STOP") == "1":
        return
    key = os.environ.get("RUNPOD_API_KEY")
    if not key or POD_ID == "local":
        log.error("cannot self-terminate: RUNPOD_API_KEY or RUNPOD_POD_ID missing")
        return
    async with ClientSession(timeout=ClientTimeout(total=20)) as http:
        async with http.delete(
            f"https://api.runpod.io/v2/pods/{POD_ID}", headers={"Authorization": f"Bearer {key}"}
        ) as response:
            log.warning("self-terminate -> HTTP %s", response.status)


async def watchdog(_app):
    async def loop():
        while True:
            await asyncio.sleep(30)
            now = time.monotonic()
            if sessions or not state["ready"]:
                state["last_activity"] = now  # loading/building engines is not idle
            if now - BOOT > MAX_SECONDS:
                await terminate_self("MAX_SESSION_MINUTES reached")
            elif now - state["last_activity"] > IDLE_SECONDS:
                await terminate_self("idle")

    task = asyncio.ensure_future(loop())
    yield
    task.cancel()


def main():
    if not TOKEN_SECRET:
        raise SystemExit("TOKEN_SECRET is not set")

    def load_and_run():
        try:
            engine.load()
        except Exception:
            log.exception("model load failed")
            state["stage"] = "error"
            return
        engine.run()

    threading.Thread(target=load_and_run, daemon=True).start()
    app = web.Application(middlewares=[cors_and_auth], client_max_size=MAX_PARAMS_BYTES)
    app.router.add_get("/health", health)
    app.router.add_post("/whip", whip_post)
    app.router.add_delete("/whip/{session_id}", whip_delete)
    app.router.add_post("/params", params_post)
    app.cleanup_ctx.append(watchdog)
    web.run_app(app, host="0.0.0.0", port=PORT, access_log=None)


if __name__ == "__main__":
    main()
