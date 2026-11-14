#!/bin/bash
# Pod entrypoint. The Python environment (~13 GB) isn't in the image: it lives as one
# compressed archive per release on the network volume and is unpacked to the container
# disk here (seconds), or built first if this release has no archive yet (~15 min, once).
# Meanwhile a tiny status server answers /health with the stage, so api/runpod.php and the
# page can show progress; server.py takes port 8000 over once the environment is ready.
set -euo pipefail

PORT="${PORT:-8000}"
RELEASE="$(sha256sum /app/install-env.sh | cut -c1-12)"   # a new install script = a new environment
ENVS=/workspace/envs
ARCHIVE="$ENVS/env-$RELEASE.tar.zst"
STAGE_FILE=/tmp/stage

stage() { printf '%s' "$1" > "$STAGE_FILE"; echo "[start] $1"; }

# /health while the environment is set up (python3-minimal from the image, not the env)
stage "preparing"
python3 - "$PORT" "$STAGE_FILE" <<'EOF' &
import http.server, json, sys
port, stage_file = int(sys.argv[1]), sys.argv[2]
class Status(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({"ready": False, "stage": open(stage_file).read()}).encode()
        self.send_response(200 if self.path == "/health" else 503)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass
http.server.HTTPServer(("0.0.0.0", port), Status).serve_forever()
EOF
STATUS_PID=$!

t0=$(date +%s)
if [ -f "$ARCHIVE" ]; then
    stage "unpacking the AI"
    tar -I 'zstd -T0' -xf "$ARCHIVE" -C /
else
    stage "installing the AI (first start of this release, about 15 min)"
    bash /app/install-env.sh
    stage "saving the AI for the next starts"
    mkdir -p "$ENVS"
    tmp="$ARCHIVE.tmp.$$"
    tar -I 'zstd -T0 -3' -cf "$tmp" -C / opt/env
    mv "$tmp" "$ARCHIVE"
    # Older releases' archives are no longer used
    find "$ENVS" -maxdepth 1 -name 'env-*.tar.zst' ! -name "env-$RELEASE.tar.zst" -delete
fi
echo "[start] environment ready in $(( $(date +%s) - t0 ))s (release $RELEASE)"

kill "$STATUS_PID"
wait "$STATUS_PID" 2>/dev/null || true
exec /opt/env/venv/bin/python /app/server.py
