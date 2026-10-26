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
# Login details are read from .env (see .env.example).
set -euo pipefail

FILES=(index.html script.js coloris.min.js coloris.min.css daydream_logo.svg favicon.ico diffusion_lab_teaser.mp4)

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
  git show "$commit:$file" > "$work/$file" 2>/dev/null || { echo "$file is not in $ref" >&2; exit 1; }
done

echo "Deploying $(git log -1 --format='%h %s' "$commit")"
echo "  to $base/ (FTPS)"
if [ -n "$(git status --porcelain -- "${FILES[@]}")" ]; then
  echo "  Note: local changes to site files are NOT included (only the committed version is)."
fi
printf '  %s\n' "${FILES[@]}"

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
  ftp_curl --output "$backup/$file" "$base/$file" 2>/dev/null || echo "  (no live $file yet)"
done

echo "Uploading"
for file in "${FILES[@]}"; do
  echo "  $file"
  ftp_curl --ftp-create-dirs --upload-file "$work/$file" "$base/$file"
done
echo "Done: https://${DEPLOY_SITE_URL:-diffusionlab.de}/ now serves $(git log -1 --format=%h "$commit")."
