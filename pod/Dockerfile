# Diffusion-Lab GPU pod: StreamDiffusion (Daydream's fork) behind a small WebRTC server.
# Build: docker build -t <registry>/diffusionlab-pod:<tag> pod/
# Models and TensorRT engines are NOT baked in: they live on the network volume
# (/workspace/hf, /workspace/engines/<gpu>) so the image stays small and engines match the GPU.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_CACHE_DIR=/tmp/uv-cache \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    HF_HOME=/workspace/hf

RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# uv, pinned
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /usr/local/bin/uv

# StreamDiffusion fork pinned to the commit the spike was measured with
ARG STREAMDIFFUSION_COMMIT=4c90d9e
RUN git clone https://github.com/daydreamlive/StreamDiffusion.git /opt/streamdiffusion \
    && git -C /opt/streamdiffusion checkout ${STREAMDIFFUSION_COMMIT}

RUN uv venv /opt/venv --python 3.11 \
    && uv pip install torch==2.7.0 torchvision==0.22.0 --index-url https://download.pytorch.org/whl/cu128 \
    && uv pip install setuptools wheel \
    && uv pip install -e '/opt/streamdiffusion[tensorrt,controlnet,ipadapter]' xformers==0.0.30 \
        --extra-index-url https://download.pytorch.org/whl/cu128 --index-strategy unsafe-best-match \
    && python -m streamdiffusion.tools.install-tensorrt \
    # peft switches diffusers to its PEFT backend; without it the fork's cached-attention
    # processor passes a stale `scale` argument and engine export fails
    && uv pip install peft==0.21.3 aiohttp==3.14.5 aiortc==1.16.0 \
    && rm -rf /tmp/uv-cache

WORKDIR /app
# IPAdapter needs a style image at load time; it starts disabled, the page sends the real one
RUN python -c "from PIL import Image; Image.new('RGB', (512, 512), (128, 128, 128)).save('/app/style-default.png')"
COPY server.py config.yaml ./

EXPOSE 8000
CMD ["python", "server.py"]
