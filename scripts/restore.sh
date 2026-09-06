#!/bin/sh
set -eu

BUNDLE_DIR=.
ARCHIVE=""
IDENTITY=""
START=false
ALLOW_SUDO=false

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }
run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; return; fi
  [ "$ALLOW_SUDO" = true ] || die "Storage ownership repair requires explicit --allow-sudo: $*"
  has sudo || die "sudo is unavailable: $*"
  sudo "$@"
}
env_get() {
  local key=$1
  local value
  
  # Use grep to find the line safely, then extract value
  value=$(grep -m1 "^${key}=" "$BUNDLE_DIR/.env" 2>/dev/null | cut -d= -f2- || echo "")
  
  # Remove surrounding quotes safely using parameter expansion
  # Remove single quotes
  value="${value#\'}"
  value="${value%\'}"
  # Remove double quotes
  value="${value#\"}"
  value="${value%\"}"
  
  printf '%s' "$value"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --bundle-dir) BUNDLE_DIR=$2; shift ;;
    --archive) ARCHIVE=$2; shift ;;
    --identity) IDENTITY=$2; shift ;;
    --start) START=true ;;
    --allow-sudo) ALLOW_SUDO=true ;;
    --help) printf '%s\n' "Usage: restore.sh --archive FILE [--identity AGE_KEY] [--bundle-dir DIR] [--start] [--allow-sudo]"; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

[ -n "$ARCHIVE" ] || die "--archive is required"
[ -f "$ARCHIVE" ] || die "Archive does not exist: $ARCHIVE"
[ -f "$ARCHIVE.sha256" ] || die "Missing checksum: $ARCHIVE.sha256"
(cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256")
[ -f "$BUNDLE_DIR/.env" ] || die "Missing current bundle .env"

STAGE=$(mktemp -d)
RAW=$ARCHIVE
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT HUP INT TERM
case "$ARCHIVE" in
  *.age)
    has age || die "age is required to decrypt this backup"
    [ -n "$IDENTITY" ] || die "--identity is required for an encrypted backup"
    RAW=$STAGE/backup.tar.gz
    age -d -i "$IDENTITY" -o "$RAW" "$ARCHIVE"
    ;;
esac
tar -tzf "$RAW" | while IFS= read -r path; do
  case "$path" in /*|../*|*/../*|*/..) die "Unsafe path in backup: $path" ;; esac
done
tar -C "$STAGE" -xzf "$RAW"
find "$STAGE" -type l -print | while IFS= read -r link; do
  case "$link" in
    "$STAGE/bundle"/*) allowed_root=$STAGE/bundle ;;
    "$STAGE/persistent"/*) allowed_root=$STAGE/persistent ;;
    *) die "Backup link is outside an allowed root: $link" ;;
  esac
  resolved=$(readlink -f "$link") || die "Backup contains a dangling link: $link"
  [ -e "$resolved" ] || die "Backup contains a dangling link: $link"
  case "$resolved" in
    "$allowed_root"|"$allowed_root"/*) ;;
    *) die "Backup link escapes its allowed root: $link" ;;
  esac
done
[ -f "$STAGE/backup.properties" ] || die "Invalid backup: missing metadata"
[ -d "$STAGE/persistent/config" ] || die "Invalid backup: missing config data"
[ -d "$STAGE/persistent/data" ] || die "Invalid backup: missing user data"

CURRENT_VERSION=$(env_get GET_OWNCLOUD_OCIS_VERSION)
BACKUP_VERSION=$(sed -n 's/^ocis_version=//p' "$STAGE/backup.properties")
[ "$CURRENT_VERSION" = "$BACKUP_VERSION" ] ||
  die "Restore version mismatch: current=$CURRENT_VERSION backup=$BACKUP_VERSION; restore and upgrade must be separate"

ENGINE=$(env_get GET_OWNCLOUD_RUNTIME)
[ -n "$ENGINE" ] || ENGINE=docker
[ -f "$BUNDLE_DIR/scripts/runtime-common.sh" ] || die "Bundle is missing scripts/runtime-common.sh"
# shellcheck source=/dev/null
. "$BUNDLE_DIR/scripts/runtime-common.sh"
get_owncloud_runtime_setup "$ENGINE" "$BUNDLE_DIR"

CONFIG_DIR=$(env_get OCIS_CONFIG_DIR)
DATA_DIR=$(env_get OCIS_DATA_DIR)
case "$CONFIG_DIR" in /*) ;; *) CONFIG_DIR=$BUNDLE_DIR/$CONFIG_DIR ;; esac
case "$DATA_DIR" in /*) ;; *) DATA_DIR=$BUNDLE_DIR/$DATA_DIR ;; esac
get_owncloud_assert_storage_paths "$CONFIG_DIR" "$DATA_DIR"
(cd "$BUNDLE_DIR" && get_owncloud_compose down --remove-orphans)
recovery=$BUNDLE_DIR/.pre-restore-$(date -u '+%Y%m%dT%H%M%SZ')
mkdir -p "$recovery" "$(dirname "$CONFIG_DIR")" "$(dirname "$DATA_DIR")"
[ ! -e "$CONFIG_DIR" ] || mv "$CONFIG_DIR" "$recovery/config"
[ ! -e "$DATA_DIR" ] || mv "$DATA_DIR" "$recovery/data"
mkdir -p "$CONFIG_DIR" "$DATA_DIR"
cp -a "$STAGE/persistent/config/." "$CONFIG_DIR/"
cp -a "$STAGE/persistent/data/." "$DATA_DIR/"
get_owncloud_repair_restored_storage "$ENGINE" "$CONFIG_DIR" "$DATA_DIR"

if [ "$START" = true ]; then
  (cd "$BUNDLE_DIR" && get_owncloud_compose up -d)
fi
trap - EXIT HUP INT TERM
rm -rf "$STAGE"
printf 'Restore completed. Previous data retained at %s\n' "$recovery"
