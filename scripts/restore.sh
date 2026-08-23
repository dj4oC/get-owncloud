#!/bin/sh
set -eu

BUNDLE_DIR=.
ARCHIVE=""
IDENTITY=""
START=false

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }
env_get() {
  value=$(sed -n "s/^$1=//p" "$BUNDLE_DIR/.env" | tail -n 1)
  printf '%s' "$value" | sed 's/^"//; s/"$//'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --bundle-dir) BUNDLE_DIR=$2; shift ;;
    --archive) ARCHIVE=$2; shift ;;
    --identity) IDENTITY=$2; shift ;;
    --start) START=true ;;
    --help) printf '%s\n' "Usage: restore.sh --archive FILE [--identity AGE_KEY] [--bundle-dir DIR] [--start]"; exit 0 ;;
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
if find "$STAGE" -type l -print -quit | grep -q .; then
  die "Backup contains symbolic links; restore refuses link traversal ambiguity"
fi
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
(cd "$BUNDLE_DIR" && get_owncloud_compose down --remove-orphans)

CONFIG_DIR=$(env_get OCIS_CONFIG_DIR)
DATA_DIR=$(env_get OCIS_DATA_DIR)
case "$CONFIG_DIR" in /*) ;; *) CONFIG_DIR=$BUNDLE_DIR/$CONFIG_DIR ;; esac
case "$DATA_DIR" in /*) ;; *) DATA_DIR=$BUNDLE_DIR/$DATA_DIR ;; esac
recovery=$BUNDLE_DIR/.pre-restore-$(date -u '+%Y%m%dT%H%M%SZ')
mkdir -p "$recovery/config" "$recovery/data" "$CONFIG_DIR" "$DATA_DIR"
restore_persistent() {
  source_path=$1
  target_path=$2
  recovery_path=$3
  if [ "$ENGINE" = podman ] && [ "$(id -u)" -ne 0 ]; then
    podman unshare sh -ec 'cp -a "$1/." "$2/"; find "$1" -mindepth 1 -maxdepth 1 -exec rm -rf {} +; cp -a "$3/." "$1/"; chown -R 1000:1000 "$1"' sh "$target_path" "$recovery_path" "$source_path"
  elif [ "$ENGINE" = docker ]; then
    image=$(env_get OCIS_IMAGE)
    docker run --rm --user 0:0 --entrypoint /bin/sh \
      -v "$target_path:/target:rw" -v "$recovery_path:/recovery:rw" -v "$source_path:/source:ro" "$image" \
      -ec 'cp -a /target/. /recovery/; find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} +; cp -a /source/. /target/; chown -R 1000:1000 /target'
  else
    cp -a "$target_path/." "$recovery_path/"
    find "$target_path" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -a "$source_path/." "$target_path/"
    chown -R 1000:1000 "$target_path"
  fi
}
restore_persistent "$STAGE/persistent/config" "$CONFIG_DIR" "$recovery/config"
restore_persistent "$STAGE/persistent/data" "$DATA_DIR" "$recovery/data"

if [ "$START" = true ]; then
  (cd "$BUNDLE_DIR" && get_owncloud_compose up -d)
fi
trap - EXIT HUP INT TERM
rm -rf "$STAGE"
printf 'Restore completed. Previous data retained at %s\n' "$recovery"
