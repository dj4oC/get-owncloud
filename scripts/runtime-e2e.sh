#!/bin/sh
set -eu

ROOT_DIR=${1:-$(pwd)}
ENGINE=${2:-docker}
WORK_DIR=${GET_OWNCLOUD_E2E_WORK_DIR:-$(mktemp -d)}
BUNDLE_DIR=$WORK_DIR/bundle
BACKUP=$WORK_DIR/owncloud-e2e-backup.tar.gz
DOMAIN=ocis.owncloud.test
COLLABORA_DOMAIN=collabora.owncloud.test
PORT=8443
export SOURCE_DATE_EPOCH=0
case "$ENGINE" in docker|podman) ;; *) printf 'E2E ERROR: unsupported runtime %s\n' "$ENGINE" >&2; exit 1 ;; esac
if [ "$ENGINE" = podman ]; then
  PROFILE=$ROOT_DIR/examples/evaluation-podman.json
  COLLABORA_ENABLED=false
else
  PROFILE=$ROOT_DIR/examples/evaluation-docker-collabora.json
  COLLABORA_ENABLED=true
fi

die() { printf 'E2E ERROR: %s\n' "$*" >&2; exit 1; }
cleanup() {
  status=$?
  if [ "$status" -ne 0 ] && [ -f "$BUNDLE_DIR/.env" ] && [ -n "${GET_OWNCLOUD_COMPOSE_ENGINE:-}" ]; then
    (cd "$BUNDLE_DIR" && get_owncloud_compose ps && get_owncloud_compose logs --no-color --tail=200) >&2 || true
  fi
  if [ -f "$BUNDLE_DIR/.env" ] && [ -n "${GET_OWNCLOUD_COMPOSE_ENGINE:-}" ]; then (cd "$BUNDLE_DIR" && get_owncloud_compose down -v --remove-orphans) >/dev/null 2>&1 || true; fi
  if [ -z "${GET_OWNCLOUD_E2E_KEEP:-}" ]; then
    if [ "$ENGINE" = podman ]; then podman unshare rm -rf "$WORK_DIR"; else rm -rf "$WORK_DIR"; fi
  fi
}
trap cleanup EXIT HUP INT TERM

for tool in "$ENGINE" curl sha256sum cmp node; do command -v "$tool" >/dev/null 2>&1 || die "$tool is required"; done
node "$ROOT_DIR/src/cli.mjs" render "$PROFILE" "$BUNDLE_DIR" \
  --accept-eula --secrets-file "$ROOT_DIR/test/fixtures/e2e-secrets.json"
if [ "$ENGINE" = podman ]; then
  # Model the documented operator-owned UID/GID preparation without weakening the runtime preflight.
  mkdir -p "$BUNDLE_DIR/data/config" "$BUNDLE_DIR/data/data"
  podman unshare chown -R 1000:1000 "$BUNDLE_DIR/data/config" "$BUNDLE_DIR/data/data"
fi
# shellcheck source=/dev/null
. "$BUNDLE_DIR/scripts/runtime-common.sh"
get_owncloud_runtime_setup "$ENGINE" "$BUNDLE_DIR"
(cd "$BUNDLE_DIR" && sha256sum -c manifest.sha256)
(cd "$BUNDLE_DIR" && get_owncloud_compose config --quiet)

sh "$BUNDLE_DIR/install.sh" --bundle-dir "$BUNDLE_DIR" --engine "$ENGINE" --non-interactive --accept-eula
sh "$BUNDLE_DIR/scripts/healthcheck.sh" --url "https://$DOMAIN:$PORT/healthz" --domain "$DOMAIN" --port "$PORT" --evaluation-insecure --timeout 180

if [ "$COLLABORA_ENABLED" = true ]; then
  curl -fsS --insecure --resolve "$COLLABORA_DOMAIN:$PORT:127.0.0.1" \
    "https://$COLLABORA_DOMAIN:$PORT/hosting/discovery" | grep -q 'urlsrc=' || die "Collabora discovery did not expose WOPI actions"
fi
curl -fsS --insecure --resolve "$DOMAIN:$PORT:127.0.0.1" "https://$DOMAIN:$PORT/" | grep -qi 'owncloud' ||
  die "ownCloud web response is unavailable"

ADMIN_PASSWORD=$(node -e "const f=require(process.argv[1]); process.stdout.write(f.adminPassword)" "$ROOT_DIR/test/fixtures/e2e-secrets.json")
printf '%s\n' "get-owncloud persistence and restore e2e" >"$WORK_DIR/payload.txt"
WEBDAV_URL="https://$DOMAIN:$PORT/remote.php/dav/files/admin/get-owncloud-e2e.txt"
curl -fsS --insecure --resolve "$DOMAIN:$PORT:127.0.0.1" -u "admin:$ADMIN_PASSWORD" -T "$WORK_DIR/payload.txt" "$WEBDAV_URL"
curl -fsS --insecure --resolve "$DOMAIN:$PORT:127.0.0.1" -u "admin:$ADMIN_PASSWORD" "$WEBDAV_URL" -o "$WORK_DIR/download.txt"
cmp "$WORK_DIR/payload.txt" "$WORK_DIR/download.txt" || die "WebDAV upload/download mismatch"

(cd "$BUNDLE_DIR" && get_owncloud_compose restart)
sh "$BUNDLE_DIR/scripts/healthcheck.sh" --url "https://$DOMAIN:$PORT/healthz" --domain "$DOMAIN" --port "$PORT" --evaluation-insecure --timeout 180
curl -fsS --insecure --resolve "$DOMAIN:$PORT:127.0.0.1" -u "admin:$ADMIN_PASSWORD" "$WEBDAV_URL" -o "$WORK_DIR/restarted.txt"
cmp "$WORK_DIR/payload.txt" "$WORK_DIR/restarted.txt" || die "Persistence failed after restart"

sh "$BUNDLE_DIR/scripts/backup.sh" --bundle-dir "$BUNDLE_DIR" --output "$BACKUP" --allow-unencrypted-evaluation
sh "$BUNDLE_DIR/scripts/healthcheck.sh" --url "https://$DOMAIN:$PORT/healthz" --domain "$DOMAIN" --port "$PORT" --evaluation-insecure --timeout 180
curl -fsS --insecure --resolve "$DOMAIN:$PORT:127.0.0.1" -u "admin:$ADMIN_PASSWORD" -X DELETE "$WEBDAV_URL"
if curl -fsS --insecure --resolve "$DOMAIN:$PORT:127.0.0.1" -u "admin:$ADMIN_PASSWORD" "$WEBDAV_URL" >/dev/null 2>&1; then
  die "WebDAV delete did not remove the recovery fixture"
fi

sh "$BUNDLE_DIR/scripts/restore.sh" --bundle-dir "$BUNDLE_DIR" --archive "$BACKUP" --start
sh "$BUNDLE_DIR/scripts/healthcheck.sh" --url "https://$DOMAIN:$PORT/healthz" --domain "$DOMAIN" --port "$PORT" --evaluation-insecure --timeout 180
curl -fsS --insecure --resolve "$DOMAIN:$PORT:127.0.0.1" -u "admin:$ADMIN_PASSWORD" "$WEBDAV_URL" -o "$WORK_DIR/restored.txt"
cmp "$WORK_DIR/payload.txt" "$WORK_DIR/restored.txt" || die "Backup/restore recovery mismatch"

test -s "$BUNDLE_DIR/.get-owncloud/eula-acceptance.log" || die "Local EULA audit evidence is missing"
test -s "$BUNDLE_DIR/readiness-report.json" || die "Readiness evidence is missing"
(cd "$BUNDLE_DIR" && sha256sum -c manifest.sha256)
printf '%s\n' "Full $ENGINE runtime E2E passed: render, manifest, health, WebDAV, restart, backup and restore (Collabora=$COLLABORA_ENABLED)."
