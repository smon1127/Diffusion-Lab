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
# Login details are read from .env (see .env.example). If .env sets DAYDREAM_API_KEY,
# it is uploaded to api/.secrets/ for the PHP proxy in api/daydream.php, which keeps
# it out of the page. That folder is blocked for web access by its .htaccess; the key
# is only uploaded after a probe file there is confirmed unreachable from the web.
set -euo pipefail

FILES=(index.html script.js coloris.min.js coloris.min.css daydream_logo.svg favicon.ico diffusion_lab_teaser.mp4 api/daydream.php api/.secrets/.htaccess)
SITE_URL="https://diffusionlab.de"
SECRETS_DIR="api/.secrets" # inside the web folder, blocked by its .htaccess

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
if [ -n "${DAYDREAM_API_KEY:-}" ]; then
  echo "  + Daydream API key -> $SECRETS_DIR/daydream.key (web access blocked, checked before upload)"
else
  echo "  (no DAYDREAM_API_KEY in .env: the proxy keeps its current key, if any)"
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

if [ -n "${DAYDREAM_API_KEY:-}" ]; then
  # Prove the folder is blocked for web access before putting the key there
  probe="probe-$(date +%s)-$RANDOM.txt"
  echo "harmless deploy probe" > "$work/$probe"
  ftp_curl --upload-file "$work/$probe" "$base/$SECRETS_DIR/$probe"
  probe_status="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/$SECRETS_DIR/$probe")"
  ftp_curl --quote "DELE ${remote_dir:+$remote_dir/}$SECRETS_DIR/$probe" --list-only "$base/$SECRETS_DIR/" >/dev/null 2>&1 || true
  if [ "$probe_status" != "403" ] && [ "$probe_status" != "404" ]; then
    echo "NOT uploading the API key: $SECRETS_DIR/ is reachable from the web (HTTP $probe_status)." >&2
    exit 1
  fi
  echo "Uploading the Daydream API key for the proxy ($SECRETS_DIR/ is blocked for web access: HTTP $probe_status)"
  ( umask 077; printf '%s\n' "$DAYDREAM_API_KEY" > "$work/daydream.key" )
  ftp_curl --upload-file "$work/daydream.key" "$base/$SECRETS_DIR/daydream.key"
fi
echo "Done: https://diffusionlab.de/ now serves $(git log -1 --format=%h "$commit")."
