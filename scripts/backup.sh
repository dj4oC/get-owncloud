#!/bin/sh
set -eu

BUNDLE_DIR=.
OUTPUT=""
RECIPIENT=""
ALLOW_UNENCRYPTED=false
ALLOW_SUDO=false
RESTART=true

usage() {
  printf '%s\n' "Usage: backup.sh [--bundle-dir DIR] [--output FILE] --recipient AGE_RECIPIENT [--allow-sudo]"
  printf '%s\n' "       backup.sh ... --allow-unencrypted-evaluation"
}
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }
env_get() {
  value=$(sed -n "s/^$1=//p" "$BUNDLE_DIR/.env" | tail -n 1)
  printf '%s' "$value" | sed 's/^"//; s/"$//'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --bundle-dir) BUNDLE_DIR=$2; shift ;;
    --output) OUTPUT=$2; shift ;;
    --recipient) RECIPIENT=$2; shift ;;
    --allow-unencrypted-evaluation) ALLOW_UNENCRYPTED=true ;;
    --allow-sudo) ALLOW_SUDO=true ;;
    --no-restart) RESTART=false ;;
    --help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; return; fi
  [ "$ALLOW_SUDO" = true ] || die "Docker storage backup requires explicit --allow-sudo: $*"
  has sudo || die "sudo is unavailable: $*"
  sudo "$@"
}

[ -f "$BUNDLE_DIR/.env" ] || die "Missing $BUNDLE_DIR/.env"
PURPOSE=$(env_get GET_OWNCLOUD_PURPOSE)
CONFIG_DIR=$(env_get OCIS_CONFIG_DIR)
DATA_DIR=$(env_get OCIS_DATA_DIR)
case "$CONFIG_DIR" in /*) ;; *) CONFIG_DIR=$BUNDLE_DIR/$CONFIG_DIR ;; esac
case "$DATA_DIR" in /*) ;; *) DATA_DIR=$BUNDLE_DIR/$DATA_DIR ;; esac
[ -d "$CONFIG_DIR" ] || die "Configuration directory does not exist: $CONFIG_DIR"
[ -d "$DATA_DIR" ] || die "Data directory does not exist: $DATA_DIR"

if [ -z "$RECIPIENT" ]; then
  if [ "$PURPOSE" != evaluation ] || [ "$ALLOW_UNENCRYPTED" != true ]; then
    die "Production backups require an age recipient controlled by the operator"
  fi
else
  has age || die "age is required for encrypted backup"
fi

has tar || die "tar is required"
has sha256sum || die "sha256sum is required"
ENGINE=$(env_get GET_OWNCLOUD_RUNTIME)
[ -n "$ENGINE" ] || ENGINE=docker
[ "$ENGINE" != podman ] || has podman || die "podman is required for a rootless Podman backup"
[ -f "$BUNDLE_DIR/scripts/runtime-common.sh" ] || die "Bundle is missing scripts/runtime-common.sh"
# shellcheck source=/dev/null
. "$BUNDLE_DIR/scripts/runtime-common.sh"
get_owncloud_runtime_setup "$ENGINE" "$BUNDLE_DIR"
get_owncloud_assert_storage_paths "$CONFIG_DIR" "$DATA_DIR"

timestamp=$(date -u '+%Y%m%dT%H%M%SZ')
[ -n "$OUTPUT" ] || OUTPUT=$(dirname "$BUNDLE_DIR")/get-owncloud-backup-$timestamp.tar.gz
case "$OUTPUT" in *.age) RAW_OUTPUT=${OUTPUT%.age} ;; *) RAW_OUTPUT=$OUTPUT ;; esac
STAGE=$(mktemp -d)
WAS_RUNNING=false
remove_stage() {
  if [ "$ENGINE" = podman ] && [ "$(id -u)" -ne 0 ]; then
    podman unshare rm -rf "$STAGE"
  else
    rm -rf "$STAGE"
  fi
}
cleanup() {
  remove_stage
  if [ "$WAS_RUNNING" = true ] && [ "$RESTART" = true ]; then
    (cd "$BUNDLE_DIR" && get_owncloud_compose up -d) >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT HUP INT TERM

if (cd "$BUNDLE_DIR" && get_owncloud_compose ps -q 2>/dev/null | grep -q .); then WAS_RUNNING=true; fi
(cd "$BUNDLE_DIR" && get_owncloud_compose down --remove-orphans)

mkdir -p "$STAGE/bundle" "$STAGE/persistent/config" "$STAGE/persistent/data"
for item in .env deployment-profile.json deployment.lock.json sizing-report.json eula-acknowledgement.json manifest.sha256 README.md config *.yml install.sh scripts; do
  case "$item" in '*.yml') continue ;; esac
  [ -e "$BUNDLE_DIR/$item" ] || continue
  cp -a "$BUNDLE_DIR/$item" "$STAGE/bundle/"
done
for item in "$BUNDLE_DIR"/*.yml; do
  [ -f "$item" ] || continue
  cp -a "$item" "$STAGE/bundle/"
done
if [ "$ENGINE" = podman ] && [ "$(id -u)" -ne 0 ]; then
  # Runtime files can be owned by subordinate IDs. Enter the same rootless
  # user namespace so the backup is complete without broad host permissions.
  podman unshare cp -a "$CONFIG_DIR/." "$STAGE/persistent/config/"
  podman unshare cp -a "$DATA_DIR/." "$STAGE/persistent/data/"
  podman unshare chown -hR 0:0 "$STAGE/persistent"
elif [ "$ENGINE" = docker ]; then
  # The stopped container's UID 1000 may create mode-0600 files. Escalation is
  # explicit and applies only to the disposable staging copy, never live data.
  run_privileged cp -a "$CONFIG_DIR/." "$STAGE/persistent/config/"
  run_privileged cp -a "$DATA_DIR/." "$STAGE/persistent/data/"
  run_privileged chown -hR "$(id -u):$(id -g)" "$STAGE/persistent"
else
  cp -a "$CONFIG_DIR/." "$STAGE/persistent/config/"
  cp -a "$DATA_DIR/." "$STAGE/persistent/data/"
fi
{
  printf 'format=1\n'
  printf 'created_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf 'ocis_version=%s\n' "$(env_get GET_OWNCLOUD_OCIS_VERSION)"
  printf 'config_source=%s\n' "$CONFIG_DIR"
  printf 'data_source=%s\n' "$DATA_DIR"
} >"$STAGE/backup.properties"

if [ "$ENGINE" = podman ] && [ "$(id -u)" -ne 0 ]; then
  podman unshare tar -C "$STAGE" -czf "$RAW_OUTPUT" backup.properties bundle persistent
else
  tar -C "$STAGE" -czf "$RAW_OUTPUT" backup.properties bundle persistent
fi
chmod 600 "$RAW_OUTPUT"
if [ -n "$RECIPIENT" ]; then
  ENCRYPTED=$RAW_OUTPUT.age
  age -r "$RECIPIENT" -o "$ENCRYPTED" "$RAW_OUTPUT"
  chmod 600 "$ENCRYPTED"
  rm -f "$RAW_OUTPUT"
  FINAL=$ENCRYPTED
else
  FINAL=$RAW_OUTPUT
fi
sha256sum "$FINAL" >"$FINAL.sha256"
chmod 600 "$FINAL.sha256"

if [ "$WAS_RUNNING" = true ] && [ "$RESTART" = true ]; then
  (cd "$BUNDLE_DIR" && get_owncloud_compose up -d)
  WAS_RUNNING=false
fi
trap - EXIT HUP INT TERM
remove_stage
printf 'Verified backup created: %s\n' "$FINAL"
