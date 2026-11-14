# Diffusion-Lab GPU pod: StreamDiffusion (Daydream's fork) behind a small WebRTC server.
# Build: docker build -t <registry>/diffusionlab-pod:<tag> pod/
#
# Deliberately small (well under 1 GB): pulling the old 11 GB image took ~6.5 min on every
# machine new to it, and RunPod rarely gives us the same machine twice. Everything heavy
# lives on the network volume instead:
#   /workspace/envs/env-<release>.tar.zst  the Python environment (built by install-env.sh,
#                                          unpacked by start.sh)
#   /workspace/hf                          the models
#   /workspace/engines/<gpu>               TensorRT engines, one set per GPU type
FROM nvidia/cuda:12.8.1-base-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/workspace/hf \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

# libgl1/libglib2.0-0: OpenCV; zstd: the environment archive; python3-minimal: the status
# page during setup; git + build-essential: only for building a new environment
# (insightface, from the IPAdapter extra, compiles C++)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates libgl1 libglib2.0-0 zstd python3-minimal git build-essential \
    && rm -rf /var/lib/apt/lists/*

# uv, pinned
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /usr/local/bin/uv

WORKDIR /app
COPY start.sh install-env.sh server.py config.yaml ./
RUN chmod +x start.sh install-env.sh

EXPOSE 8000
CMD ["/app/start.sh"]
