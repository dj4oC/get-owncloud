#!/bin/sh
set -eu

URL="https://localhost:9200/healthz"
TIMEOUT=60
EVALUATION_INSECURE=false
DOMAIN=""
PORT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --url) URL=$2; shift ;;
    --domain) DOMAIN=$2; shift ;;
    --port) PORT=$2; shift ;;
    --timeout) TIMEOUT=$2; shift ;;
    --evaluation-insecure) EVALUATION_INSECURE=true ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

command -v curl >/dev/null 2>&1 || { printf 'curl is required\n' >&2; exit 1; }
case "$URL" in
  https://*) ;;
  http://localhost:*|http://127.0.0.1:*) [ "$EVALUATION_INSECURE" = true ] || { printf 'Plain HTTP is evaluation-only\n' >&2; exit 1; } ;;
  *) printf 'Health URL must use HTTPS\n' >&2; exit 1 ;;
esac

case "$PORT" in ''|*[!0-9]*) [ -z "$DOMAIN" ] || { printf 'A numeric --port is required with --domain\n' >&2; exit 2; } ;; esac
response=$(mktemp)
cleanup() { rm -f "$response"; }
trap cleanup EXIT HUP INT TERM
if [ -n "$DOMAIN" ] && [ "$EVALUATION_INSECURE" = true ]; then
  status=$(curl -sS --retry 10 --retry-all-errors --retry-delay 3 --max-time "$TIMEOUT" \
    --insecure --resolve "$DOMAIN:$PORT:127.0.0.1" -o "$response" -w '%{http_code}' "$URL") ||
    { printf 'oCIS health endpoint failed: %s\n' "$URL" >&2; exit 1; }
elif [ -n "$DOMAIN" ]; then
  status=$(curl -sS --retry 10 --retry-all-errors --retry-delay 3 --max-time "$TIMEOUT" \
    --resolve "$DOMAIN:$PORT:127.0.0.1" -o "$response" -w '%{http_code}' "$URL") ||
    { printf 'oCIS health endpoint failed: %s\n' "$URL" >&2; exit 1; }
elif [ "$EVALUATION_INSECURE" = true ]; then
  status=$(curl -sS --retry 10 --retry-all-errors --retry-delay 3 --max-time "$TIMEOUT" \
    --insecure -o "$response" -w '%{http_code}' "$URL") ||
    { printf 'oCIS health endpoint failed: %s\n' "$URL" >&2; exit 1; }
else
  status=$(curl -sS --retry 10 --retry-all-errors --retry-delay 3 --max-time "$TIMEOUT" \
    -o "$response" -w '%{http_code}' "$URL") ||
    { printf 'oCIS health endpoint failed: %s\n' "$URL" >&2; exit 1; }
fi
[ "$status" = 200 ] || { printf 'oCIS health endpoint returned HTTP %s: %s\n' "$status" "$URL" >&2; exit 1; }
printf 'oCIS health endpoint passed: %s\n' "$URL"
