#!/bin/sh
set -eu

URL="https://localhost:9200/healthz"
TIMEOUT=60
EVALUATION_INSECURE=false
EVALUATION_CA_BUNDLE=""
DOMAIN=""
PORT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --url) URL=$2; shift ;;
    --domain) DOMAIN=$2; shift ;;
    --port) PORT=$2; shift ;;
    --timeout) TIMEOUT=$2; shift ;;
    --evaluation-insecure) 
      printf 'WARNING: --evaluation-insecure is deprecated. Use --evaluation-ca-bundle with a trusted CA bundle instead.\n' >&2
      EVALUATION_INSECURE=true 
      ;;
    --evaluation-ca-bundle) EVALUATION_CA_BUNDLE=$2; shift ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

command -v curl >/dev/null 2>&1 || { printf 'curl is required\n' >&2; exit 1; }

# Validate domain to prevent argument injection
validate_domain() {
  case "$1" in
    ''|*[!a-zA-Z0-9.-]*) return 1 ;;
    *) return 0 ;;
  esac
}

case "$URL" in
  https://*) ;;
  http://localhost:*|http://127.0.0.1:*) [ "$EVALUATION_INSECURE" = true ] || { printf 'Plain HTTP is evaluation-only\n' >&2; exit 1; } ;;
  *) printf 'Health URL must use HTTPS\n' >&2; exit 1 ;;
esac

case "$PORT" in ''|*[!0-9]*) [ -z "$DOMAIN" ] || { printf 'A numeric --port is required with --domain\n' >&2; exit 2; } ;; esac

# Validate domain if provided
[ -n "$DOMAIN" ] && validate_domain "$DOMAIN" || { printf 'Invalid domain: %s\n' "$DOMAIN" >&2; exit 2; }
response=$(mktemp)
cleanup() { rm -f "$response"; }
trap cleanup EXIT HUP INT TERM

# Build curl options for TLS verification
curl_tls_opts=""
if [ "$EVALUATION_INSECURE" = true ]; then
  # Deprecated: still supported for backwards compatibility but not recommended
  curl_tls_opts="--insecure"
  printf 'WARNING: Using insecure TLS verification. This is not recommended for production.\n' >&2
elif [ -n "$EVALUATION_CA_BUNDLE" ]; then
  curl_tls_opts="--cacert \"$EVALUATION_CA_BUNDLE\""
fi

if [ -n "$DOMAIN" ] && [ "$EVALUATION_INSECURE" = true ]; then
  status=$(curl -fsS --retry 10 --retry-all-errors --retry-delay 3 --max-time "$TIMEOUT" \
    $curl_tls_opts --resolve "$DOMAIN:$PORT:127.0.0.1" -o "$response" -w '%{http_code}' "$URL") ||
    { printf 'oCIS health endpoint failed: %s\n' "$URL" >&2; exit 1; }
elif [ -n "$DOMAIN" ]; then
  status=$(curl -fsS --retry 10 --retry-all-errors --retry-delay 3 --max-time "$TIMEOUT" \
    $curl_tls_opts --resolve "$DOMAIN:$PORT:127.0.0.1" -o "$response" -w '%{http_code}' "$URL") ||
    { printf 'oCIS health endpoint failed: %s\n' "$URL" >&2; exit 1; }
elif [ "$EVALUATION_INSECURE" = true ]; then
  status=$(curl -fsS --retry 10 --retry-all-errors --retry-delay 3 --max-time "$TIMEOUT" \
    $curl_tls_opts -o "$response" -w '%{http_code}' "$URL") ||
    { printf 'oCIS health endpoint failed: %s\n' "$URL" >&2; exit 1; }
else
  status=$(curl -fsS --retry 10 --retry-all-errors --retry-delay 3 --max-time "$TIMEOUT" \
    $curl_tls_opts -o "$response" -w '%{http_code}' "$URL") ||
    { printf 'oCIS health endpoint failed: %s\n' "$URL" >&2; exit 1; }
fi
[ "$status" = 200 ] || { printf 'oCIS health endpoint returned HTTP %s: %s\n' "$status" "$URL" >&2; exit 1; }
printf 'oCIS health endpoint passed: %s\n' "$URL"
