#!/bin/sh
set -eu

BUNDLE_DIR=.
CANDIDATE_URL="https://get.owncloud.com/releases/stable-8.2.env"
CHECK_ONLY=false

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
env_get() {
  value=$(sed -n "s/^$1=//p" "$BUNDLE_DIR/.env" | tail -n 1)
  printf '%s' "$value" | sed 's/^"//; s/"$//'
}
candidate_get() { sed -n "s/^$1=//p" "$CANDIDATE" | tail -n 1; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --bundle-dir) BUNDLE_DIR=$2; shift ;;
    --candidate-url) CANDIDATE_URL=$2; shift ;;
    --check-only) CHECK_ONLY=true ;;
    --help) printf '%s\n' "Usage: update-service.sh [--bundle-dir DIR] [--candidate-url HTTPS_URL] [--check-only]"; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

case "$CANDIDATE_URL" in https://*) ;; *) die "Candidate URL must use HTTPS" ;; esac
for tool in curl sha256sum jq; do command -v "$tool" >/dev/null 2>&1 || die "$tool is required"; done
[ -f "$BUNDLE_DIR/.env" ] || die "Missing bundle .env"
TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"' EXIT HUP INT TERM
CANDIDATE=$TEMP/candidate.env
curl -fsS --proto '=https' --tlsv1.2 "$CANDIDATE_URL" -o "$CANDIDATE"
curl -fsS --proto '=https' --tlsv1.2 "$CANDIDATE_URL.sha256" -o "$TEMP/candidate.env.sha256"
expected=$(awk 'match($1, /^[0-9a-f]{64}$/) { print $1; exit }' "$TEMP/candidate.env.sha256")
actual=$(sha256sum "$CANDIDATE" | awk '{print $1}')
if [ -z "$expected" ] || [ "$actual" != "$expected" ]; then
  die "Candidate feed checksum mismatch"
fi

CURRENT=$(env_get GET_OWNCLOUD_OCIS_VERSION)
VERSION=$(candidate_get VERSION)
IMAGE=$(candidate_get IMAGE)
SECURITY=$(candidate_get SECURITY)
BREAKING=$(candidate_get BREAKING)
MIGRATION=$(candidate_get MIGRATION)
STORAGE_SCHEMA=$(candidate_get STORAGE_SCHEMA)
IDM_SCHEMA=$(candidate_get IDM_SCHEMA)
ROLLBACK_SAFE=$(candidate_get ROLLBACK_SAFE)
PUBLISHED_EPOCH=$(candidate_get PUBLISHED_EPOCH)
case "$VERSION" in 8.2.*) ;; *) die "Only same-minor 8.2 patches are eligible" ;; esac
case "$CURRENT" in 8.2.*) ;; *) die "Current deployment is outside the automatic 8.2 patch line" ;; esac
printf '%s\n' "$IMAGE" | grep -Eq '^docker\.io/owncloud/ocis@sha256:[0-9a-f]{64}$' ||
  die "Candidate image is not digest-pinned"
current_patch=${CURRENT##*.}; candidate_patch=${VERSION##*.}
case "$current_patch:$candidate_patch:$PUBLISHED_EPOCH" in *[!0-9:]*|:*|*::*|*:) die "Candidate version metadata is malformed" ;; esac
if [ "$candidate_patch" -le "$current_patch" ]; then
  printf 'No newer eligible patch: current=%s candidate=%s\n' "$CURRENT" "$VERSION"
  exit 0
fi
if [ "$SECURITY" != true ] || [ "$BREAKING" != false ] || [ "$MIGRATION" != false ] || \
  [ "$STORAGE_SCHEMA" != false ] || [ "$IDM_SCHEMA" != false ] || [ "$ROLLBACK_SAFE" != true ]; then
  printf 'Manual review required for %s: security=%s breaking=%s migration=%s storage_schema=%s idm_schema=%s rollback_safe=%s\n' \
    "$VERSION" "$SECURITY" "$BREAKING" "$MIGRATION" "$STORAGE_SCHEMA" "$IDM_SCHEMA" "$ROLLBACK_SAFE"
  exit 0
fi
now=$(date -u '+%s')
delay=$(env_get GET_OWNCLOUD_UPDATE_DELAY_HOURS)
[ "$now" -ge "$((PUBLISHED_EPOCH + delay * 3600))" ] || die "Candidate is still inside the observation window"
printf 'Eligible security patch: %s -> %s\n' "$CURRENT" "$VERSION"
[ "$CHECK_ONLY" = false ] || exit 0
[ "$(env_get GET_OWNCLOUD_AUTO_SECURITY_UPDATES)" = true ] || die "Automatic security updates are disabled"
RECIPIENT=$(env_get GET_OWNCLOUD_BACKUP_RECIPIENT)
[ -n "$RECIPIENT" ] || die "Automatic update blocked: configure an operator-controlled backup recipient"

sh "$BUNDLE_DIR/scripts/backup.sh" --bundle-dir "$BUNDLE_DIR" --recipient "$RECIPIENT"
cp "$BUNDLE_DIR/.env" "$TEMP/env.old"
cp "$BUNDLE_DIR/deployment.lock.json" "$TEMP/lock.old"
replace_env() {
  key=$1; value=$2
  escaped=$(printf '%s' "$value" | sed 's/[&|]/\\&/g')
  sed "s|^$key=.*|$key=\"$escaped\"|" "$BUNDLE_DIR/.env" >"$TEMP/env.new"
  mv "$TEMP/env.new" "$BUNDLE_DIR/.env"
  chmod 600 "$BUNDLE_DIR/.env"
}
replace_env OCIS_IMAGE "$IMAGE"
replace_env GET_OWNCLOUD_OCIS_VERSION "$VERSION"
jq --arg version "$VERSION" --arg image "$IMAGE" \
  '.ocisVersion=$version | .images.ocis=$image | .lastAutomaticSecurityUpdate=$version' \
  "$BUNDLE_DIR/deployment.lock.json" >"$TEMP/lock.new"
mv "$TEMP/lock.new" "$BUNDLE_DIR/deployment.lock.json"

ENGINE=$(env_get GET_OWNCLOUD_RUNTIME)
[ -f "$BUNDLE_DIR/scripts/runtime-common.sh" ] || die "Bundle is missing scripts/runtime-common.sh"
# shellcheck source=/dev/null
. "$BUNDLE_DIR/scripts/runtime-common.sh"
get_owncloud_runtime_setup "$ENGINE" "$BUNDLE_DIR"
domain=$(env_get OCIS_DOMAIN); port=$(env_get HTTPS_PORT)
health_args="--url https://$domain:$port/healthz --domain $domain --port $port"
[ "$(env_get GET_OWNCLOUD_PURPOSE)" != evaluation ] || health_args="$health_args --evaluation-insecure"
# shellcheck disable=SC2086
if (cd "$BUNDLE_DIR" && get_owncloud_compose pull && get_owncloud_compose up -d) &&
  sh "$BUNDLE_DIR/scripts/healthcheck.sh" $health_args; then
  (cd "$BUNDLE_DIR" && while read -r _ file; do
    [ -f "$file" ] || die "Manifest path disappeared during update: $file"
    sha256sum "$file"
  done <manifest.sha256 >"$TEMP/manifest.new")
  mv "$TEMP/manifest.new" "$BUNDLE_DIR/manifest.sha256"
  printf 'Security update applied and health-checked: %s\n' "$VERSION"
else
  cp "$TEMP/env.old" "$BUNDLE_DIR/.env"
  cp "$TEMP/lock.old" "$BUNDLE_DIR/deployment.lock.json"
  (cd "$BUNDLE_DIR" && get_owncloud_compose up -d) || true
  die "Update failed; configuration was rolled back to $CURRENT"
fi
