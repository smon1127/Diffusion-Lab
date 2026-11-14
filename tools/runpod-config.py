#!/usr/bin/env python3
"""Builds api/.secrets/runpod.json for api/runpod.php from environment variables.

Used by deploy.sh and .github/workflows/deploy.yml. Prints nothing secret: the JSON
goes to the file given as the only argument. Exits 2 (and writes nothing) when
RUNPOD_API_KEY is unset, so callers can skip the upload.

  RUNPOD_API_KEY              RunPod API key (needs pod create/read/delete)
  RUNPOD_TOKEN_SECRET         shared HMAC secret; the pod gets the same value as a RunPod secret
  RUNPOD_TEMPLATE_ID          pod template to create sessions from
  RUNPOD_IMAGE                optional, the pod image release (overrides the template's; a
                              stopped pod with another image is replaced, not resumed)
  RUNPOD_GPU_IDS              comma-separated GPU type ids, tried in order
  RUNPOD_DATA_CENTER_IDS      optional, comma-separated
  RUNPOD_NETWORK_VOLUME_ID    optional, mounted at /workspace
  RUNPOD_CLOUD                optional, SECURE (default) or COMMUNITY
  RUNPOD_PORT                 optional, the pod's HTTP port (default 8000)
  RUNPOD_MAX_SESSION_MINUTES  optional, hard limit per pod (default 60)
"""
import json
import os
import sys


def env_list(name):
    return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: runpod-config.py <output file>")
    if not os.environ.get("RUNPOD_API_KEY"):
        sys.exit(2)
    missing = [n for n in ("RUNPOD_TOKEN_SECRET", "RUNPOD_TEMPLATE_ID", "RUNPOD_GPU_IDS") if not os.environ.get(n)]
    if missing:
        sys.exit("RUNPOD_API_KEY is set, but these are empty: " + ", ".join(missing))
    if len(os.environ["RUNPOD_TOKEN_SECRET"]) < 32:
        sys.exit("RUNPOD_TOKEN_SECRET must be at least 32 characters (try: openssl rand -hex 32)")

    config = {
        "apiKey": os.environ["RUNPOD_API_KEY"],
        "tokenSecret": os.environ["RUNPOD_TOKEN_SECRET"],
        "templateId": os.environ["RUNPOD_TEMPLATE_ID"],
        "image": os.environ.get("RUNPOD_IMAGE", ""),
        "gpuIds": env_list("RUNPOD_GPU_IDS"),
        "dataCenterIds": env_list("RUNPOD_DATA_CENTER_IDS"),
        "networkVolumeId": os.environ.get("RUNPOD_NETWORK_VOLUME_ID", ""),
        "cloud": os.environ.get("RUNPOD_CLOUD") or "SECURE",
        "port": int(os.environ.get("RUNPOD_PORT") or 8000),
        "maxSessionMinutes": int(os.environ.get("RUNPOD_MAX_SESSION_MINUTES") or 60),
    }
    old_umask = os.umask(0o077)
    try:
        with open(sys.argv[1], "w") as out:
            json.dump(config, out)
    finally:
        os.umask(old_umask)


if __name__ == "__main__":
    main()
