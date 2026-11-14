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
  STUN servers). So ICE should connect directly with just STUN for most visitors; TURN is a
  fallback for restrictive browser networks. *To confirm end to end with `test/whip-test.html`.*
- Every pod gets `RUNPOD_POD_ID` and `RUNPOD_API_KEY`, so it can delete itself with
  `DELETE https://api.runpod.io/v2/pods/$RUNPOD_POD_ID`.
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

### Engine (to fill in from the benchmark)
| Config | Engine build | Steady fps | p50 ms | p95 ms | VRAM |
|---|---|---|---|---|---|
| A SD-Turbo + canny + depth ControlNet | | | | | |
| B A + cached attention (StreamV2V) | | | | | |
| C SDXL-Turbo + canny + depth ControlNet | | | | | |
| D C + cached attention | | | | | |
