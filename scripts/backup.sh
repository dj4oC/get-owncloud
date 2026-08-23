#!/bin/sh
set -eu

BUNDLE_DIR=.
OUTPUT=""
RECIPIENT=""
ALLOW_UNENCRYPTED=false
RESTART=true

usage() {
  printf '%s\n' "Usage: backup.sh [--bundle-dir DIR] [--output FILE] --recipient AGE_RECIPIENT"
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
    --no-restart) RESTART=false ;;
    --help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

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
[ -f "$BUNDLE_DIR/scripts/runtime-common.sh" ] || die "Bundle is missing scripts/runtime-common.sh"
# shellcheck source=/dev/null
. "$BUNDLE_DIR/scripts/runtime-common.sh"
get_owncloud_runtime_setup "$ENGINE" "$BUNDLE_DIR"

timestamp=$(date -u '+%Y%m%dT%H%M%SZ')
[ -n "$OUTPUT" ] || OUTPUT=$(dirname "$BUNDLE_DIR")/get-owncloud-backup-$timestamp.tar.gz
case "$OUTPUT" in *.age) RAW_OUTPUT=${OUTPUT%.age} ;; *) RAW_OUTPUT=$OUTPUT ;; esac
STAGE=$(mktemp -d)
WAS_RUNNING=false
cleanup() {
  if [ "$ENGINE" = podman ] && [ "$(id -u)" -ne 0 ]; then podman unshare rm -rf "$STAGE"; else rm -rf "$STAGE"; fi
  if [ "$WAS_RUNNING" = true ] && [ "$RESTART" = true ]; then
    (cd "$BUNDLE_DIR" && get_owncloud_compose up -d) >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT HUP INT TERM

if (cd "$BUNDLE_DIR" && get_owncloud_compose ps -q ocis 2>/dev/null | grep -q .); then WAS_RUNNING=true; fi
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
copy_persistent() {
  source_path=$1
  destination_path=$2
  if [ "$ENGINE" = podman ] && [ "$(id -u)" -ne 0 ]; then
    podman unshare cp -a "$source_path/." "$destination_path/"
  elif [ "$ENGINE" = docker ]; then
    image=$(env_get OCIS_IMAGE)
    uid=$(id -u); gid=$(id -g)
    docker run --rm --user 0:0 --entrypoint /bin/sh -v "$destination_path:/destination:rw" "$image" \
      -ec 'chown -R 1000:1000 /destination'
    docker run --rm --user 1000:1000 --entrypoint /bin/sh \
      -v "$source_path:/source:ro" -v "$destination_path:/destination:rw" "$image" \
      -ec 'cp -a /source/. /destination/'
    docker run --rm --user 0:0 --entrypoint /bin/sh -v "$destination_path:/destination:rw" "$image" \
      -ec "chown -R $uid:$gid /destination"
  else
    cp -a "$source_path/." "$destination_path/"
  fi

  links=$STAGE/.persistent-links
  if [ "$ENGINE" = podman ] && [ "$(id -u)" -ne 0 ]; then
    podman unshare find "$destination_path" -type l -print >"$links"
  else
    find "$destination_path" -type l -print >"$links"
  fi
  while IFS= read -r link; do
    if [ "$ENGINE" = podman ] && [ "$(id -u)" -ne 0 ]; then
      target=$(podman unshare readlink "$link"); resolved=$(podman unshare realpath -m "$(dirname "$link")/$target")
    else
      target=$(readlink "$link"); resolved=$(realpath -m "$(dirname "$link")/$target")
    fi
    case "$target" in /*) die "Persistent symlink is absolute: $link" ;; esac
    case "$resolved" in "$destination_path"|"$destination_path"/*) ;; *) die "Persistent symlink escapes its storage root: $link" ;; esac
  done <"$links"
}
copy_persistent "$CONFIG_DIR" "$STAGE/persistent/config"
copy_persistent "$DATA_DIR" "$STAGE/persistent/data"
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
if [ "$ENGINE" = podman ] && [ "$(id -u)" -ne 0 ]; then podman unshare rm -rf "$STAGE"; else rm -rf "$STAGE"; fi
printf 'Verified backup created: %s\n' "$FINAL"
