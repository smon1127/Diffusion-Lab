#!/usr/bin/env bash
# Uploads the static site to diffusionlab.de (Hetzner web hosting) over FTPS.
#
#   ./deploy.sh              deploy the files as of the last commit (HEAD)
#   ./deploy.sh --ref master deploy another branch, tag or commit
#   ./deploy.sh --dry-run    show what would happen, connect to nothing
#   ./deploy.sh --yes        skip the confirmation prompt
#
# Files come from a git commit, not the working copy, so uncommitted changes
# (like a local API key in script.js) never go live. The current live files are
# downloaded to deploy-backups/<timestamp>/ before anything is overwritten.
# Login details are read from .env (see .env.example). The RUNPOD_* settings there
# become api/.secrets/runpod.json for api/runpod.php (see tools/runpod-config.py), which
# keeps the RunPod key out of the page. That folder is blocked for web access by its
# .htaccess; secrets are only uploaded after a probe file there is confirmed
# unreachable from the web. Files listed in OBSOLETE are deleted from the server.
set -euo pipefail

FILES=(index.html script.js prompt-presets.js coloris.min.js coloris.min.css favicon.ico diffusion_lab_teaser.mp4 models/selfie_segmenter.tflite api/runpod.php api/.secrets/.htaccess)
SITE_URL="https://diffusionlab.de"
SECRETS_DIR="api/.secrets" # inside the web folder, blocked by its .htaccess
# No longer part of the site (the Daydream backend): removed from the server on deploy
OBSOLETE=(api/daydream.php daydream_logo.svg api/.secrets/daydream.key api/.secrets/stream-creations.json)

ref="HEAD"
dry_run=false
assume_yes=false
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) ref="${2:?--ref needs a branch, tag or commit}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    --yes|-y) assume_yes=true; shift ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env. Create it with: cp .env.example .env  (then fill in your FTP login)" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a
for var in DEPLOY_HOST DEPLOY_USER DEPLOY_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "$var is empty in .env" >&2
    exit 1
  fi
done

commit="$(git rev-parse --verify --quiet "$ref^{commit}")" || { echo "Unknown git ref: $ref" >&2; exit 1; }
remote_dir="${DEPLOY_PATH:-public_html}"
remote_dir="${remote_dir%/}"
base="ftp://$DEPLOY_HOST${remote_dir:+/$remote_dir}"

# Export the files from the commit into a private temp folder
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"
for file in "${FILES[@]}"; do
  mkdir -p "$work/$(dirname "$file")"
  git show "$commit:$file" > "$work/$file" 2>/dev/null || { echo "$file is not in $ref" >&2; exit 1; }
done

echo "Deploying $(git log -1 --format='%h %s' "$commit")"
echo "  to $base/ (FTPS)"
if [ -n "$(git status --porcelain -- "${FILES[@]}")" ]; then
  echo "  Note: local changes to site files are NOT included (only the committed version is)."
fi
printf '  %s\n' "${FILES[@]}"
printf '  - %s (removed from the server)\n' "${OBSOLETE[@]}"
# Secret files for api/.secrets/, built in the private temp folder
secrets=()
if python3 tools/runpod-config.py "$work/runpod.json"; then
  secrets+=(runpod.json)
  echo "  + RunPod settings -> $SECRETS_DIR/runpod.json (web access blocked, checked before upload)"
else
  [ $? -eq 2 ] || exit 1
  echo "  (no RUNPOD_API_KEY in .env: api/runpod.php keeps its current settings, if any)"
fi

if $dry_run; then
  echo "Dry run: nothing was uploaded."
  exit 0
fi

if ! $assume_yes; then
  read -r -p "Upload these files to the live site? [y/N] " answer
  case "$answer" in y|Y|yes|YES) ;; *) echo "Cancelled."; exit 0 ;; esac
fi

# The password goes through a private netrc file, never the command line
netrc="$work/.netrc"
( umask 077; printf 'machine %s login %s password %s\n' "$DEPLOY_HOST" "$DEPLOY_USER" "$DEPLOY_PASSWORD" > "$netrc" )
ftp_curl() { curl --fail --silent --show-error --ssl-reqd --netrc-file "$netrc" "$@"; }

backup="deploy-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
echo "Backing up live files to $backup/"
for file in "${FILES[@]}"; do
  mkdir -p "$backup/$(dirname "$file")"
  ftp_curl --output "$backup/$file" "$base/$file" 2>/dev/null || echo "  (no live $file yet)"
done

echo "Uploading"
for file in "${FILES[@]}"; do
  echo "  $file"
  ftp_curl --ftp-create-dirs --upload-file "$work/$file" "$base/$file"
done

if [ ${#secrets[@]} -gt 0 ]; then
  # Prove the folder is blocked for web access before putting secrets there
  probe="probe-$(date +%s)-$RANDOM.txt"
  echo "harmless deploy probe" > "$work/$probe"
  ftp_curl --upload-file "$work/$probe" "$base/$SECRETS_DIR/$probe"
  probe_status="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/$SECRETS_DIR/$probe")"
  ftp_curl --quote "DELE ${remote_dir:+$remote_dir/}$SECRETS_DIR/$probe" --list-only "$base/$SECRETS_DIR/" >/dev/null 2>&1 || true
  if [ "$probe_status" != "403" ] && [ "$probe_status" != "404" ]; then
    echo "NOT uploading secrets: $SECRETS_DIR/ is reachable from the web (HTTP $probe_status)." >&2
    exit 1
  fi
  for secret in "${secrets[@]}"; do
    echo "Uploading $SECRETS_DIR/$secret ($SECRETS_DIR/ is blocked for web access: HTTP $probe_status)"
    ftp_curl --upload-file "$work/$secret" "$base/$SECRETS_DIR/$secret"
  done
fi
for file in "${OBSOLETE[@]}"; do
  if ftp_curl --quote "DELE ${remote_dir:+$remote_dir/}$file" --list-only "$base/$(dirname "$file")/" >/dev/null 2>&1; then
    echo "Removed obsolete $file"
  fi
done
echo "Done: https://diffusionlab.de/ now serves $(git log -1 --format=%h "$commit")."
