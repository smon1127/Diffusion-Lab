#!/usr/bin/env python3
"""Safety net for the Diffusion-Lab GPU pods: stops any of our pods that has been running
longer than the session limit (plus a grace period). Meant for cron, e.g. every 10 min:

  */10 * * * * /usr/bin/python3 /path/to/Diffusionlab/tools/runpod-safety-net.py

The pods normally stop themselves (idle watcher, MAX_SESSION_MINUTES) and api/runpod.php
stops them at the end of a session; this only catches what slipped through (a crashed
server, a pod that never finished loading...). It only touches pods whose name starts with
"diffusionlab-" (the names api/runpod.php gives them), and only stops them: a stopped pod
costs nothing and is resumed or replaced by the next start.

Reads RUNPOD_API_KEY and RUNPOD_MAX_SESSION_MINUTES from the repo's .env. Every action is
appended to ~/.diffusionlab-safety-net.log; the exit status is 1 if it had to stop a pod,
so cron's mail (if configured) reports it.
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LOG = Path.home() / ".diffusionlab-safety-net.log"
GRACE_MINUTES = 10
API = "https://api.runpod.io/v2/"


def read_env():
    env = {}
    for line in (REPO / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def call(key, method, path, body=None):
    request = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()
        return json.loads(raw) if raw else {}


def log(message):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}"
    print(line)
    with LOG.open("a") as out:
        out.write(line + "\n")


def main():
    env = read_env()
    key = env.get("RUNPOD_API_KEY")
    if not key:
        sys.exit("RUNPOD_API_KEY is not set in .env")
    limit_seconds = 60 * (int(env.get("RUNPOD_MAX_SESSION_MINUTES") or 60) + GRACE_MINUTES)

    stopped = 0
    for pod in call(key, "GET", "pods").get("pods", []):
        if not pod.get("name", "").startswith("diffusionlab-") or pod.get("status") != "RUNNING":
            continue
        uptime = (pod.get("runtime") or {}).get("uptime") or 0
        if uptime > limit_seconds:
            call(key, "POST", f"pods/{pod['id']}/action", {"action": "stop"})
            log(f"STOPPED pod {pod['id']} ({pod.get('gpu', {}).get('id')}, ${pod.get('cost')}/h): "
                f"running {uptime // 60} min, limit {limit_seconds // 60} min")
            stopped += 1
    sys.exit(1 if stopped else 0)


if __name__ == "__main__":
    main()
