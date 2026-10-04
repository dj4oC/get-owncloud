#!/bin/bash

# Shared Docker/Podman runtime setup. Callers define die() and set BUNDLE_DIR first.
get_owncloud_compose() {
  case "${GET_OWNCLOUD_COMPOSE_ENGINE:-}" in
    docker) docker compose "$@" ;;
    podman) podman compose "$@" ;;
    *) die "Compose runtime has not been initialized" ;;
  esac
}

get_owncloud_compose_validate() {
  if [ "$GET_OWNCLOUD_COMPOSE_ENGINE" = podman ]; then
    podman compose config >/dev/null
  else
    docker compose config --quiet
  fi
}

get_owncloud_compose_debug() {
  if [ "$GET_OWNCLOUD_COMPOSE_ENGINE" = podman ]; then
    get_owncloud_compose ps
    get_owncloud_compose logs
  else
    get_owncloud_compose ps -a
    get_owncloud_compose logs --no-color --tail 200
  fi
}

get_owncloud_assert_storage_paths() {
  storage_config=$1
  storage_data=$2
  
  # Check if both parameters are provided
  [ -z "$storage_config" ] || [ -z "$storage_data" ] && die "Storage paths must not be empty"
  
  for storage_path in "$storage_config" "$storage_data"; do
    # Must not be empty
    [ -z "$storage_path" ] && die "Unsafe storage path: $storage_path"
    
    # Must be relative (not absolute) - check for leading /
    case "$storage_path" in
      /*) die "Unsafe storage path: $storage_path" ;;
    esac
    
    # Check for .. in any component or . as the entire path
    case "$storage_path" in
      .|..|*..*) die "Unsafe storage path: $storage_path" ;;
    esac
  done
  
  [ "$storage_config" != "$storage_data" ] || die "Configuration and data paths must be distinct"
  case "$storage_config/" in "$storage_data/"*) die "Configuration path must not be inside the data path" ;; esac
  case "$storage_data/" in "$storage_config/"*) die "Data path must not be inside the configuration path" ;; esac
}

get_owncloud_prepare_storage() {
  storage_engine=$1
  storage_config=$2
  storage_data=$3
  get_owncloud_assert_storage_paths "$storage_config" "$storage_data"
  mkdir -p "$storage_config" "$storage_data"
  if [ "$storage_engine" = docker ]; then
    storage_operator_gid=$(id -g)
    for storage_path in "$storage_config" "$storage_data"; do
      storage_metadata=$(stat -c '%u:%g:%a' "$storage_path")
      if [ "$storage_metadata" != "1000:$storage_operator_gid:2770" ]; then
        run_privileged chown "1000:$storage_operator_gid" "$storage_path"
        run_privileged chmod 2770 "$storage_path"
      fi
    done
  else
    chmod 700 "$storage_config" "$storage_data"
  fi
}


get_owncloud_repair_restored_storage() {
  storage_engine=$1
  storage_config=$2
  storage_data=$3
  get_owncloud_assert_storage_paths "$storage_config" "$storage_data"
  if [ "$storage_engine" = docker ]; then
    storage_operator_gid=$(id -g)
    # Restore extraction deliberately normalizes archive ownership. Reassign
    # only the two validated recovered roots to the pinned container UID.
    run_privileged chown -hR "1000:$storage_operator_gid" "$storage_config" "$storage_data"
    run_privileged chmod 2770 "$storage_config" "$storage_data"
  else
    chmod 700 "$storage_config" "$storage_data"
  fi
}

get_owncloud_safe_env_get() {
  local key=$1
  local file=$2
  local value
  
  # Use grep to find the line safely, then extract value
  value=$(grep -m1 "^${key}=" "$file" 2>/dev/null | cut -d= -f2- || echo "")
  
  # Remove surrounding quotes safely using parameter expansion
  # Remove single quotes
  value="${value#\'}"
  value="${value%\'}"
  # Remove double quotes
  value="${value#\"}"
  value="${value%\"}"
  
  printf '%s' "$value"
}

get_owncloud_runtime_setup() {
  runtime_engine=$1
  runtime_bundle=$2
  COMPOSE_PROJECT_NAME=$(get_owncloud_safe_env_get COMPOSE_PROJECT_NAME "$runtime_bundle/.env")
  COMPOSE_FILE=$(get_owncloud_safe_env_get COMPOSE_FILE "$runtime_bundle/.env")
  export COMPOSE_PROJECT_NAME COMPOSE_FILE
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
            if systemctl enable --now podman.socket >/dev/null 2>&1; then
              socket_started=true
            fi
          else
            if systemctl --user enable --now podman.socket >/dev/null 2>&1; then
              socket_started=true
            fi
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
