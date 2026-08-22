#!/bin/sh
set -eu

URL="https://localhost:9200/healthz"
TIMEOUT=60
EVALUATION_INSECURE=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --url) URL=$2; shift ;;
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

curl_args="-fsS --retry 5 --retry-all-errors --retry-delay 2 --max-time $TIMEOUT"
if [ "$EVALUATION_INSECURE" = true ]; then curl_args="$curl_args --insecure"; fi
# shellcheck disable=SC2086
body=$(curl $curl_args "$URL") || { printf 'oCIS health endpoint failed: %s\n' "$URL" >&2; exit 1; }
[ -n "$body" ] || { printf 'oCIS health endpoint returned an empty body\n' >&2; exit 1; }
printf 'oCIS health endpoint passed: %s\n' "$URL"
