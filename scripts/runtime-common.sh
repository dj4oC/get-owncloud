#!/bin/sh

# Shared Docker/Podman runtime setup. Callers define die() and set BUNDLE_DIR first.
get_owncloud_compose() {
  case "${GET_OWNCLOUD_COMPOSE_ENGINE:-}" in
    docker) docker compose "$@" ;;
    podman) podman compose "$@" ;;
    *) die "Compose runtime has not been initialized" ;;
  esac
}

get_owncloud_runtime_setup() {
  runtime_engine=$1
  runtime_bundle=$2
  GET_OWNCLOUD_COMPOSE_ENGINE=$runtime_engine
  case "$runtime_engine" in
    docker)
      export DOCKER_SOCKET_PATH="${DOCKER_SOCKET_PATH:-/var/run/docker.sock}"
      ;;
    podman)
      command -v podman >/dev/null 2>&1 || die "podman is required"
      PODMAN_COMPOSE_PROVIDER=${PODMAN_COMPOSE_PROVIDER:-podman-compose}
      export PODMAN_COMPOSE_PROVIDER
      socket_uri=$(podman info --format '{{.Host.RemoteSocket.Path}}' 2>/dev/null || true)
      socket_path=${socket_uri#unix://}
      if [ -z "$socket_path" ]; then
        if [ "$(id -u)" -eq 0 ]; then
          socket_path=/run/podman/podman.sock
        else
          socket_path=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/podman/podman.sock
        fi
      fi
      if [ ! -S "$socket_path" ]; then
        socket_started=false
        if command -v systemctl >/dev/null 2>&1; then
          if [ "$(id -u)" -eq 0 ]; then
            if systemctl enable --now podman.socket >/dev/null 2>&1; then socket_started=true; fi
          else
            if systemctl --user enable --now podman.socket >/dev/null 2>&1; then socket_started=true; fi
          fi
        fi
        if [ "$socket_started" = false ]; then
          mkdir -p "$(dirname "$socket_path")" "$runtime_bundle/.get-owncloud"
          chmod 700 "$runtime_bundle/.get-owncloud"
          nohup podman system service --time=0 "unix://$socket_path" \
            >"$runtime_bundle/.get-owncloud/podman-service.log" 2>&1 &
          printf '%s\n' "$!" >"$runtime_bundle/.get-owncloud/podman-service.pid"
        fi
        attempts=0
        while [ ! -S "$socket_path" ] && [ "$attempts" -lt 20 ]; do
          attempts=$((attempts + 1))
          sleep 1
        done
      fi
      [ -S "$socket_path" ] || die "Podman API socket did not become ready: $socket_path"
      DOCKER_SOCKET_PATH=$socket_path
      export DOCKER_SOCKET_PATH
      ;;
    *) die "Unsupported Compose runtime: $runtime_engine" ;;
  esac
}
