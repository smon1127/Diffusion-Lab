# Diffusion-Lab GPU pod

The self-hosted replacement for Daydream's hosted StreamDiffusion API, which shut down on
2026-11-13. A RunPod GPU pod runs [Daydream's StreamDiffusion fork](https://github.com/daydreamlive/StreamDiffusion)
(Apache-2.0) behind a small WebRTC server (`server.py`). The site starts the pod on demand
through `api/runpod.php`. The pod terminates itself when idle.

```
Browser ──POST start / GET status──> api/runpod.php ──RunPod REST v2──> pod (created from a template)
   │                                     │  (HMAC token, pod URL once /health says ready)
   └──WebRTC + /params (token)──────────────────────────────────────────> pod :8000 (server.py)
```

## Files

| File | What it is |
|---|---|
| `server.py` | aiohttp + aiortc: `/health`, `POST /whip` (SDP offer → answer; one peer connection carries the input up and the AI output down), `DELETE /whip/<id>`, `POST /params` (Daydream-style params → `update_stream_params`), token check, idle/max-time self-terminate |
| `Dockerfile` | CUDA 12.8 runtime, Python 3.11, torch 2.7.0 cu128, the fork pinned to `4c90d9e`, TensorRT 10.12 |
| `test/whip-test.html` | Browser test: publishes an animated canvas, shows the output, prints the ICE route, RTT and fps |

## Environment

| Variable | Default | |
|---|---|---|
| `TOKEN_SECRET` | (required) | same value as `RUNPOD_TOKEN_SECRET` in the site's `.env`. Set it as a RunPod secret: `{{ RUNPOD_SECRET_diffusionlab_token }}` |
| `ALLOWED_ORIGINS` | `https://diffusionlab.de,https://www.diffusionlab.de` | CORS + origin check |
| `IDLE_MINUTES` | 5 | no session and no authenticated request for this long → the pod deletes itself |
| `MAX_SESSION_MINUTES` | 60 | hard limit after boot (api/runpod.php passes its own value) |
| `ICE_SERVERS` | Google STUN | JSON list of `{urls, username?, credential?}`, e.g. a TURN fallback |
| `SD_CONFIG` | `/app/config.yaml` | StreamDiffusion config |
| `HF_HOME` | `/workspace/hf` | model cache on the network volume |
| `RUNPOD_POD_ID`, `RUNPOD_API_KEY` | injected by RunPod | used for self-terminate |

## Phase 0 spike findings (2026-11-14, RTX 4090, Secure Cloud, EU-RO-1, $0.89/h)

### RunPod
- **Inbound UDP isn't supported** (RunPod docs). Outbound UDP works, and the pod's NAT keeps the
  same public port for every destination (endpoint-independent mapping, tested against three
  STUN servers). **Confirmed end to end:** headless Chromium on our VPS connected with only
  Google STUN, route `host/udp -> srflx/udp` (straight to the pod's NAT-mapped UDP port), RTT
  26–36 ms, 512x512 AI output at a steady 30 fps, live `/params` applied without reconnecting.
  Caveat: the VPS has a public IP. A visitor behind a home NAT is srflx↔srflx, which should
  also work with this NAT type; a TURN fallback only matters for strict corporate networks.
- Every pod gets `RUNPOD_POD_ID` and `RUNPOD_API_KEY`, so it can delete itself with
  `DELETE https://api.runpod.io/v2/pods/$RUNPOD_POD_ID`. **Confirmed:** `server.py` with
  `IDLE_MINUTES=1` and no session deleted its own pod about 75 s after start; `get-pod` then
  answered 404 and the account had 0 pods.
- With engines already built, `server.py` was ready (`/health` → ready) **20 s** after starting.
- Auth through the public proxy: missing, garbage, expired and other-pod tokens → 401; a valid
  token from a foreign `Origin` → 403; preflight from a foreign origin → 403; a valid token → 200.
- The HTTP proxy (`https://<pod>-8000.proxy.runpod.net`) is public and unauthenticated, with a
  100 s idle timeout. WebRTC signaling is short requests, so that's fine.
- A pod from the stock `runpod/pytorch` template took about 7 min to get past "container
  starting" (image pull). Our image must be smaller, or pre-cached, to reach a 1–3 min cold start.
- On these pods `/workspace` is a network filesystem (MooseFS). Keep pip/uv caches and
  virtualenvs on the container disk: with the uv cache on `/workspace`, installs fall back to slow copies.
- The fork pins `xformers==0.0.30`, so torch 2.7.0 (cu128). The full install took 10 min.

### TURN
- Scope's "HF token → Cloudflare TURN" route goes through `turn.fastrtc.org`, whose TLS
  certificate **expired on 2026-10-05**. Don't use it. If a TURN fallback is needed: our own
  Cloudflare Realtime TURN key (credentials minted per session) or coturn on TCP/TLS 443.

### Engine benchmark (512x512 img2img, 1 step, TensorRT FP16, tiny VAE, our teaser clip, 300 frames)
Canny ControlNet plus a depth ControlNet (Depth-Anything-V2-Small, PyTorch preprocessor). "First
load" is the first-ever start: model download + ONNX export + TensorRT build. Inference time is the
whole `wrapper(image)` call, preprocessing included.

| Config | First load | Steady fps | p50 ms | p95 ms | VRAM | Frame-to-frame change* |
|---|---|---|---|---|---|---|
| A SD-Turbo | 8.8 min | **61.4** | 14.8 | 25.7 | 2.6 GB | |
| B SD-Turbo + cached attention | 8.1 min | **55.9** | 16.7 | 23.9 | 3.0 GB | |
| C SDXL-Turbo (site default) | 12.5 min | **50.6** | 19.6 | 20.4 | 7.1 GB | 5.93 (p90 9.12) |
| D SDXL-Turbo + cached attention (`cache_maxframes 2`) | 9.8 min | **38.2** | 25.8 | 28.5 | 7.9 GB | **4.61** (p90 6.85) |

\* mean absolute grey-level change between consecutive output frames; the input clip itself
changes by 4.2 (p90 7.52). With cached attention the output barely flickers more than the
input does; without it, shapes re-form from frame to frame (`C_vs_D.jpg` in the spike notes).

Takeaways:
- Speed is not the problem on a 4090: even the heaviest config runs above 30 fps.
- **Use SDXL-Turbo + cached attention as the default.** It fixes most of the flicker for 25% of the speed.
- Engines can't be built on boot (8–13 min each). Build them once per GPU type and keep them on the
  network volume (`/workspace/engines`). Engine names encode the model, LoRA, batch size and
  cached-attention flag, so every combination we offer needs its engine built in advance.
- `cached attention` needs `peft` installed (see Dockerfile), otherwise ONNX export fails with
  `Linear.forward() takes 2 positional arguments but 3 were given`.

### Follow-ups found by the spike
- ControlNet TensorRT engines fail to build in this fork (`randn(): argument 'size' ... NoneType`),
  so the ControlNets run in PyTorch. All numbers above already include that; fixing it is a speed-up.
- The depth preprocessor in the site's config is `depth_tensorrt`, which needs a prebuilt
  Depth-Anything engine (`engine_path`). The spike used `depth` (PyTorch, Depth-Anything-V2-Small).
- Diffusers warns on every frame about the [-1, 1] tensor range (`image_processor.py:730`); silence it.
- End-to-end latency (camera → AI frame on screen) still needs a frame-counter measurement in the real frontend.
- Spike cost: one RTX 4090 pod for about 65 min ≈ $0.96 (RunPod billing record not posted yet).

## Production findings (live test 2026-11-14, template `yorr15bve1`, volume `e0w3svdne3` in EU-RO-1)
- **Image pull dominates a cold start:** the 11.2 GB image took **6.3 min** from create to
  `/health` on a fresh host. That alone breaks a 5-minute warm-up.
- **Restarting on the same host is fast:** a container restart (image cached) answered
  `/health` after **5 s**. → `api/runpod.php` now **stops** pods instead of terminating them and
  resumes them on the next start. A stopped pod costs nothing (no volume disk; container disk
  isn't billed while stopped; the network volume bills either way). If its host has no free GPU,
  or the template has a newer image, a fresh pod is created instead.
- **Loading SDXL from the network volume is slower:** `from_pretrained` took 45 s (about 20 s
  from local disk on the spike pod).
- **Engine build on first start:** UNet + VAE engines built and saved in about 9 min, then reused
  ("engine_path already exists, skipping compile").
- **Out of memory with 3 ControlNets + IPAdapter on 24 GB:** 12.5 GB PyTorch + ~11 GB TensorRT
  (the UNet engine reserves for its largest profile, 1024 px / batch 4). The tile/feedback
  ControlNet was dropped (cached attention covers it); `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`.
- A failed load now deletes the pod after 2 minutes; before, a pod stuck in `error` never
  counted as idle and would have run until the 60-minute limit.

## Operating it
- **GPU fallback list** (`RUNPOD_GPU_IDS`, all in EU-RO-1 where the volume lives; stock there is
  often LOW, so one type is not enough): RTX 4090 ($0.89/h) → RTX PRO 4500 32 GB ($0.72/h) →
  RTX 5090 ($1.39/h) → A100 80 GB PCIe ($2.09/h). TensorRT engines are per GPU type
  (`/workspace/engines/<gpu>`); build them once per type with a short "prebuild" pod from the
  template, so no visitor waits 10–15 min for a first build.
- **Releasing a new pod image:** the `pod-image` workflow pushes `ghcr.io/<owner>/diffusionlab-pod:sha-<commit>`.
  Set that as `RUNPOD_IMAGE` (`.env` / repo variable) and deploy. `api/runpod.php` creates pods
  with it and replaces (instead of resuming) a stopped pod that still runs an older image.
  Also point the template at it, so pods created by hand match.
- **Safety net:** `tools/runpod-safety-net.py` from cron (every 10 min on the VPS) stops any
  `diffusionlab-*` pod running past `RUNPOD_MAX_SESSION_MINUTES` + 10; log in
  `~/.diffusionlab-safety-net.log`.
