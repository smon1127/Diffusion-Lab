#!/bin/bash
# Builds the pod's Python environment in /opt/env: Python 3.11, torch 2.7 (CUDA 12.8),
# Daydream's StreamDiffusion fork with TensorRT/ControlNet/IPAdapter, and the server's
# packages. start.sh runs it once per release (the hash of this file) and keeps the
# result as one archive on the network volume, so the image stays small and a pod on any
# machine unpacks it in seconds instead of pulling a 11 GB image.
set -euxo pipefail

export UV_PYTHON_INSTALL_DIR=/opt/env/python UV_CACHE_DIR=/tmp/uv-cache UV_LINK_MODE=copy
STREAMDIFFUSION_COMMIT=4c90d9e   # the commit the spike was measured with

rm -rf /opt/env /tmp/streamdiffusion
uv venv /opt/env/venv --python 3.11
export VIRTUAL_ENV=/opt/env/venv PATH=/opt/env/venv/bin:$PATH

uv pip install torch==2.7.0 torchvision==0.22.0 --index-url https://download.pytorch.org/whl/cu128
uv pip install setuptools wheel

git clone https://github.com/daydreamlive/StreamDiffusion.git /tmp/streamdiffusion
git -C /tmp/streamdiffusion checkout "$STREAMDIFFUSION_COMMIT"
uv pip install '/tmp/streamdiffusion[tensorrt,controlnet,ipadapter]' xformers==0.0.30 \
    --extra-index-url https://download.pytorch.org/whl/cu128 --index-strategy unsafe-best-match
python -m streamdiffusion.tools.install-tensorrt

# peft switches diffusers to its PEFT backend; without it the fork's cached-attention
# processor passes a stale `scale` argument and engine export fails
uv pip install peft==0.21.3 aiohttp==3.14.5 aiortc==1.16.0

# IPAdapter needs a style image at load time; it starts disabled, the page sends the real one
python -c "from PIL import Image; Image.new('RGB', (512, 512), (128, 128, 128)).save('/opt/env/style-default.png')"

python -c "import torch, tensorrt, streamdiffusion, aiortc; print('env ok', torch.__version__, tensorrt.__version__)"
rm -rf /tmp/uv-cache /tmp/streamdiffusion
