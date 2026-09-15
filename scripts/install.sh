#!/bin/bash
set -eu

SCRIPT_VERSION="0.2.0"
OCIS_VERSION="8.2.0"
EULA_URL="https://raw.githubusercontent.com/owncloud/ocis/stable-8.2/assets/End-User-License-Agreement-for-ownCloud-Infinite-Scale.pdf"
EULA_SHA256="f608b0819964232648c5fb6b22a4d58310331128ad645ab158a35ef1790e2148"
TARGET="single-host"
MANAGER="direct"
ENGINE="auto"
K8S_DISTRIBUTION="existing"
BUNDLE_DIR="."
DRY_RUN=false
INSTALL_MISSING=false
ALLOW_SUDO=false
ACCEPT_EULA=false
NON_INTERACTIVE=false
NO_START=false
AUTO_SECURITY_UPDATES=false
AUTO_SECURITY_UPDATES_SET=false
NFS_PATH=""

usage() {
  cat <<'EOF'
Usage: install.sh [options]
  --dry-run
  --bundle-dir DIR
  --target single-host|kubernetes
  --manager direct|ansible|argocd
  --engine auto|docker|podman
  --kubernetes-distribution existing|k3s
  --install-missing
  --allow-sudo
  --accept-eula
  --non-interactive
  --auto-security-updates=true|false
  --nfs-path PATH
  --no-start
EOF
}
die() { printf '%s\n' "ERROR: $*" >&2; exit 1; }
note() { printf '%s\n' "$*"; }
has() { command -v "$1" >/dev/null 2>&1; }
env_get() {
  local key=$1 value
  value=$(grep -m1 "^${key}=" "$BUNDLE_DIR/.env" 2>/dev/null | cut -d= -f2- || echo "")
  # Remove surrounding quotes
  value="${value#\'}""${value%\'}"
  value="${value#\"}""${value%\"}"
  printf '%s' "$value"
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help) usage; exit 0 ;;
    --dry-run) DRY_RUN=true ;;
    --bundle-dir) [ "$#" -ge 2 ] || die "--bundle-dir requires a value"; BUNDLE_DIR=$2; shift ;;
    --target) [ "$#" -ge 2 ] || die "--target requires a value"; TARGET=$2; shift ;;
    --manager) [ "$#" -ge 2 ] || die "--manager requires a value"; MANAGER=$2; shift ;;
    --engine) [ "$#" -ge 2 ] || die "--engine requires a value"; ENGINE=$2; shift ;;
    --kubernetes-distribution) [ "$#" -ge 2 ] || die "--kubernetes-distribution requires a value"; K8S_DISTRIBUTION=$2; shift ;;
    --install-missing) INSTALL_MISSING=true ;;
    --allow-sudo) ALLOW_SUDO=true ;;
    --accept-eula) ACCEPT_EULA=true ;;
    --non-interactive) NON_INTERACTIVE=true ;;
    --auto-security-updates=true) AUTO_SECURITY_UPDATES=true; AUTO_SECURITY_UPDATES_SET=true ;;
    --auto-security-updates=false) AUTO_SECURITY_UPDATES=false; AUTO_SECURITY_UPDATES_SET=true ;;
    --nfs-path) [ "$#" -ge 2 ] || die "--nfs-path requires a value"; NFS_PATH=$2; shift ;;
    --no-start) NO_START=true ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done
[ -d "$BUNDLE_DIR" ] || die "Bundle directory does not exist: $BUNDLE_DIR"
BUNDLE_DIR=$(cd "$BUNDLE_DIR" && pwd -P)
case "$BUNDLE_DIR" in *[!A-Za-z0-9_./-]*) die "Unsafe BUNDLE_DIR path: $BUNDLE_DIR" ;; esac
if [ -f "$BUNDLE_DIR/.env" ]; then
  bundled_runtime=$(env_get GET_OWNCLOUD_RUNTIME)
  case "$bundled_runtime" in docker|podman) ENGINE=$bundled_runtime; TARGET=single-host ;; esac
  OCIS_VERSION=$(env_get GET_OWNCLOUD_OCIS_VERSION)
  bundled_auto=$(env_get GET_OWNCLOUD_AUTO_SECURITY_UPDATES)
  [ "$AUTO_SECURITY_UPDATES_SET" = true ] || { [ -z "$bundled_auto" ] || AUTO_SECURITY_UPDATES=$bundled_auto; }
fi
case "$TARGET" in single-host|kubernetes) ;; *) die "Unsupported target: $TARGET" ;; esac
case "$MANAGER" in direct|ansible|argocd) ;; *) die "Unsupported manager: $MANAGER" ;; esac
case "$ENGINE" in auto|docker|podman) ;; *) die "Unsupported engine: $ENGINE" ;; esac
case "$K8S_DISTRIBUTION" in existing|k3s) ;; *) die "Unsupported Kubernetes distribution" ;; esac
[ "$MANAGER" != "argocd" ] || [ "$TARGET" = "kubernetes" ] || die "Argo CD requires Kubernetes"
[ "$MANAGER" != "ansible" ] || [ "$TARGET" = "single-host" ] || die "Ansible wraps the single-host family"
TTY=""
if [ -r /dev/tty ] && [ -w /dev/tty ]; then TTY=/dev/tty; fi
if [ "$NON_INTERACTIVE" = false ] && [ -z "$TTY" ] && [ "$DRY_RUN" = false ]; then
  die "No interactive TTY. Re-run with explicit --non-interactive flags; no defaults were chosen."
fi

OS_ID=unknown
OS_VERSION=unknown
if [ -r /etc/os-release ]; then
  OS_ID=$(sed -n 's/^ID=//p' /etc/os-release | tr -d '"' | head -n 1)
  OS_VERSION=$(sed -n 's/^VERSION_ID=//p' /etc/os-release | tr -d '"' | head -n 1)
fi
ARCH=$(uname -m)
PKG_MANAGER=none
DNF_COMMAND=dnf
for candidate in apt-get dnf zypper; do
  if has "$candidate"; then PKG_MANAGER=$candidate; break; fi
done
if [ "$PKG_MANAGER" = none ] && has microdnf; then PKG_MANAGER=dnf; DNF_COMMAND=microdnf; fi
run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; return; fi
  [ "$ALLOW_SUDO" = true ] || die "Privileged command requires explicit --allow-sudo: $*"
  has sudo || die "sudo is unavailable: $*"
  sudo "$@"
}
confirm() {
  prompt=$1
  if [ "$NON_INTERACTIVE" = true ]; then return 0; fi
  printf '%s [y/N] ' "$prompt" >"$TTY"
  IFS= read -r answer <"$TTY" || return 1
  case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}
required_tools() {
  if [ "$TARGET" = single-host ]; then
    if [ "$ENGINE" = auto ]; then
      if has docker; then ENGINE=docker; elif has podman; then ENGINE=podman; else ENGINE=docker; fi
    fi
    printf '%s\n' "$ENGINE"
  else
    printf '%s\n' kubectl helm
  fi
  [ "$MANAGER" != ansible ] || printf '%s\n' ansible
  [ "$MANAGER" != argocd ] || printf '%s\n' argocd
  if [ "$TARGET" = single-host ] && [ "$AUTO_SECURITY_UPDATES" = true ]; then
    printf '%s\n' age jq
  fi
}

tool_present() {
  case "$1" in
    docker) has docker && docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1 ;;
    podman) has podman && podman compose version >/dev/null 2>&1 && podman info >/dev/null 2>&1 ;;
    kubectl) has kubectl ;;
    helm) has helm ;;
    ansible) has ansible && has ansible-galaxy ;;
    argocd) has argocd ;;
    age) has age ;;
    jq) has jq ;;
    *) return 1 ;;
  esac
}

package_names() {
  tool=$1
  case "$PKG_MANAGER:$tool" in
    apt-get:docker) printf '%s\n' "docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin" ;;
    apt-get:podman) printf '%s\n' "podman podman-compose" ;;
    apt-get:ansible) printf '%s\n' "python3 python3-venv python3-pip" ;;
    apt-get:jq) printf '%s\n' "jq" ;;
    dnf:docker) printf '%s\n' "docker-ce docker-ce-cli containerd.io docker-compose-plugin" ;;
    dnf:podman) printf '%s\n' "podman podman-compose" ;;
    dnf:ansible) printf '%s\n' "python3 python3-pip" ;;
    dnf:jq) printf '%s\n' "jq" ;;
    zypper:docker) printf '%s\n' "docker docker-compose" ;;
    zypper:podman) printf '%s\n' "podman podman-compose" ;;
    zypper:ansible) printf '%s\n' "python3 python3-pip" ;;
    zypper:jq) printf '%s\n' "jq" ;;
    *) return 1 ;;
  esac
}

install_packages() {
  packages=$1
  # shellcheck disable=SC2086
  case "$PKG_MANAGER" in
    apt-get) run_privileged apt-get update && run_privileged apt-get install -y $packages ;;
    dnf) run_privileged "$DNF_COMMAND" install -y $packages ;;
    zypper) run_privileged zypper --non-interactive install $packages ;;
    *) die "No supported package manager" ;;
  esac
}

install_downloaded_tool() {
  tool=$1
  expected=""
  case "$ARCH" in x86_64|amd64) tool_arch=amd64 ;; aarch64|arm64) tool_arch=arm64 ;; *) die "No $tool binary for $ARCH" ;; esac
  case "$tool" in
    kubectl)
      version=v1.31.14
      url="https://dl.k8s.io/release/$version/bin/linux/$tool_arch/kubectl"
      checksum_url="$url.sha256"
      checksum_name=""
      archive=false ;;
    helm)
      version=v3.18.6
      filename="helm-$version-linux-$tool_arch.tar.gz"
      url="https://get.helm.sh/$filename"
      checksum_url="$url.sha256sum"
      checksum_name="$filename"
      archive=true ;;
    argocd)
      version=v3.1.1
      filename="argocd-linux-$tool_arch"
      url="https://github.com/argoproj/argo-cd/releases/download/$version/$filename"
      checksum_url="https://github.com/argoproj/argo-cd/releases/download/$version/cli_checksums.txt"
      checksum_name="$filename"
      archive=false ;;
    age)
      version=v1.3.1
      filename="age-$version-linux-$tool_arch.tar.gz"
      url="https://github.com/FiloSottile/age/releases/download/$version/$filename"
      checksum_url="pinned-in-bootstrap"
      if [ "$tool_arch" = amd64 ]; then
        expected=bdc69c09cbdd6cf8b1f333d372a1f58247b3a33146406333e30c0f26e8f51377
      else
        expected=c6878a324421b69e3e20b00ba17c04bc5c6dab0030cfe55bf8f68fa8d9e9093a
      fi
      checksum_name=""
      archive=true ;;
    *) die "Unknown downloaded tool: $tool" ;;
  esac
  note "INSTALL: $tool $version from $url"
  [ "$DRY_RUN" = false ] || return 0
  [ "$INSTALL_MISSING" = true ] || die "$tool is missing. Approve with --install-missing."
  confirm "Download and install pinned $tool $version?" || die "Installation declined"
  temp_dir=$(mktemp -d)
  trap 'rm -rf "$temp_dir"' EXIT HUP INT TERM
  curl -fsS --proto '=https' --tlsv1.2 "$url" -o "$temp_dir/download"
  if [ -z "$expected" ]; then
    curl -fsS --proto '=https' --tlsv1.2 "$checksum_url" -o "$temp_dir/checksum"
    if [ -n "$checksum_name" ]; then
      expected=$(awk -v name="$checksum_name" '$2 == name || $2 == "*" name {print $1; exit}' "$temp_dir/checksum")
    else
      expected=$(awk '{print $1; exit}' "$temp_dir/checksum")
    fi
  fi
  [ -n "$expected" ] || die "$tool checksum entry was not published for $tool_arch"
  actual=$(sha256sum "$temp_dir/download" | awk '{print $1}')
  [ "$actual" = "$expected" ] || die "$tool checksum mismatch"
  if [ "$archive" = true ]; then
    tar -xzf "$temp_dir/download" -C "$temp_dir"
    if [ "$tool" = helm ]; then binary=$temp_dir/linux-$tool_arch/helm; else binary=$temp_dir/age/age; fi
  else
    binary=$temp_dir/download
  fi
  run_privileged install -m 0755 "$binary" "/usr/local/bin/$tool"
  rm -rf "$temp_dir"; trap - EXIT HUP INT TERM
}

install_tool() {
  tool=$1
  case "$tool" in kubectl|helm|argocd|age) install_downloaded_tool "$tool"; return ;; esac
  packages=$(package_names "$tool") || die "No approved $tool adapter for $OS_ID $OS_VERSION ($ARCH)"
  note "INSTALL: $packages via $PKG_MANAGER"
  [ "$DRY_RUN" = false ] || return 0
  [ "$INSTALL_MISSING" = true ] || die "$tool is missing. Approve with --install-missing."
  confirm "Install $tool using $PKG_MANAGER packages: $packages?" || die "Installation declined"
  if [ "$tool" = docker ] && [ "$PKG_MANAGER" = apt-get ]; then
    install_packages "ca-certificates curl gnupg"
    temp_key=$(mktemp)
    trap 'rm -f "$temp_key"' EXIT HUP INT TERM
    curl -fsS --proto '=https' --tlsv1.2 "https://download.docker.com/linux/$OS_ID/gpg" -o "$temp_key"
    fingerprint=$(gpg --show-keys --with-colons "$temp_key" | awk -F: '$1 == "fpr" { print $10; exit }')
    [ "$fingerprint" = "9DC858229FC7DD38854AE2D88D81803C0EBFCD88" ] || die "Docker repository key fingerprint mismatch"
    run_privileged install -m 0755 -d /etc/apt/keyrings
    run_privileged install -m 0644 "$temp_key" /etc/apt/keyrings/docker.asc
    codename=$(sed -n 's/^VERSION_CODENAME=//p' /etc/os-release | tr -d '"' | head -n 1)
    [ -n "$codename" ] || die "Cannot resolve distribution codename"
    repo_line="deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$OS_ID $codename stable"
    printf '%s\n' "$repo_line" | run_privileged tee /etc/apt/sources.list.d/docker.list >/dev/null
    rm -f "$temp_key"; trap - EXIT HUP INT TERM
  fi
  if [ "$tool" = docker ] && [ "$PKG_MANAGER" = dnf ]; then
    [ "$DNF_COMMAND" = dnf ] || die "Docker vendor repository setup requires a full dnf host, not a minimal container image"
    install_packages "dnf-plugins-core"
    docker_repo_os=centos; [ "$OS_ID" != fedora ] || docker_repo_os=fedora
    run_privileged dnf config-manager --add-repo "https://download.docker.com/linux/$docker_repo_os/docker-ce.repo"
  fi
  install_packages "$packages"
  if [ "$tool" = ansible ]; then
    run_privileged python3 -m venv /opt/get-owncloud/ansible
    run_privileged /opt/get-owncloud/ansible/bin/pip install --disable-pip-version-check "ansible-core==2.18.8"
    run_privileged /opt/get-owncloud/ansible/bin/ansible-galaxy collection install "community.docker:4.4.0"
    for binary in ansible ansible-config ansible-galaxy ansible-playbook ansible-vault; do
      run_privileged ln -sf "/opt/get-owncloud/ansible/bin/$binary" "/usr/local/bin/$binary"
    done
  fi
  if [ "$tool" = docker ] && has systemctl; then run_privileged systemctl enable --now docker; fi
  tool_present "$tool" || die "$tool installation did not pass functional verification"
}

MISSING=""
# shellcheck disable=SC2046
for tool in $(required_tools); do
  if tool_present "$tool"; then note "READY: $tool"; else MISSING="$MISSING $tool"; install_tool "$tool"; fi
done
if [ "$MANAGER" = argocd ]; then argocd_controller=cli-missing; tool_present argocd && { argocd_controller=unreachable; argocd version >/dev/null 2>&1 && argocd_controller=reachable; }; note "Argo CD: $argocd_controller"; fi

if [ "$TARGET" = kubernetes ] && [ "$K8S_DISTRIBUTION" = k3s ]; then
  note "K3s is evaluation-only; production requires an existing approved cluster."
  die "K3s installation remains under open issue #6; no cluster mutation was made"
fi

check_nfs42() {
  path=$1
  [ -e "$path" ] || die "NFS path does not exist: $path"
  has findmnt || die "findmnt is required to prove effective NFS version"
  fstype=$(findmnt -n -o FSTYPE --target "$path" 2>/dev/null || true)
  options=$(findmnt -n -o OPTIONS --target "$path" 2>/dev/null || true)
  case "$fstype" in nfs|nfs4) ;; *) die "$path is not on an NFS mount" ;; esac
  printf '%s' "$options" | grep -Eq '(^|,)(nfsvers|vers)=4\.2(,|$)' ||
    die "Effective NFSv4.2 could not be proven for $path (found: $options)"
}

bundle_path() {
  case "$1" in /*) printf '%s\n' "$1" ;; *) printf '%s/%s\n' "$BUNDLE_DIR" "${1#./}" ;; esac
}

[ -z "$NFS_PATH" ] || check_nfs42 "$NFS_PATH"
note "Summary: $OS_ID $OS_VERSION target=$TARGET manager=$MANAGER missing=${MISSING:-none}"

if [ "$DRY_RUN" = true ]; then
  note "DRY RUN: no package, EULA audit, firewall, DNS, service or cluster change was made."
  exit 0
fi
if [ ! -f "$BUNDLE_DIR/.env" ]; then
  note "Part 1 complete. Configure and generate a bundle before accepting the EULA or starting oCIS."
  exit 0
fi

verify_bundle() {
  for file in manifest.sha256 deployment.lock.json deployment-profile.json eula-acknowledgement.json; do
    [ -f "$BUNDLE_DIR/$file" ] || die "Bundle is missing $file"
  done
  has sha256sum || die "sha256sum is required"
  (cd "$BUNDLE_DIR" && sha256sum -c manifest.sha256)
  for candidate in "$BUNDLE_DIR/.env" "$BUNDLE_DIR"/*.yml "$BUNDLE_DIR"/config/ocis/*; do
    [ -f "$candidate" ] || continue
    if grep -E -i 'onlyoffice|posixfs|xattr|gpfs' "$candidate" >/dev/null 2>&1; then
      die "Bundle contains a forbidden integration, storage driver or experimental feature: $candidate"
    fi
  done
  [ "$(env_get GET_OWNCLOUD_EULA_SHA256)" = "$EULA_SHA256" ] || die "Bundle EULA hash does not match this bootstrap"
  case "$(env_get GET_OWNCLOUD_OCIS_VERSION)" in 8.2.*) ;; *) die "Single-host bundle must remain on the oCIS 8.2 patch line" ;; esac
  printf '%s\n' "$(env_get OCIS_IMAGE)" | grep -Eq '^docker\.io/owncloud/ocis@sha256:[0-9a-f]{64}$' ||
    die "oCIS image is not digest-pinned"
  users=$(env_get GET_OWNCLOUD_REGISTERED_USERS)
  identity=$(env_get GET_OWNCLOUD_IDENTITY)
  [ "$identity" != embedded ] || [ "$users" -le 20 ] || die "Embedded IDP/IDM is limited to 20 users"
  if [ "$(env_get GET_OWNCLOUD_PURPOSE)" = production ]; then
    [ "$(env_get INSECURE)" = false ] || die "Production cannot disable TLS verification"
    [ "$(env_get DEMO_USERS)" = false ] || die "Production cannot create demo users"
    [ "$(env_get PROXY_ENABLE_BASIC_AUTH)" = false ] || die "Production cannot enable Basic authentication"
  fi
  if [ "$(env_get GET_OWNCLOUD_STORAGE_FILESYSTEM)" = nfs ]; then
    check_nfs42 "$(bundle_path "$(env_get OCIS_CONFIG_DIR)")"
    check_nfs42 "$(bundle_path "$(env_get OCIS_DATA_DIR)")"
  fi
}

resource_preflight() {
  cpu=$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf 1)
  ram_mib=$(awk '/MemTotal:/ {print int($2 / 1024)}' /proc/meminfo 2>/dev/null || printf 0)
  data_path=$(bundle_path "$(env_get OCIS_DATA_DIR)")
  probe=$data_path
  while [ ! -e "$probe" ] && [ "$probe" != / ] && [ "$probe" != . ]; do probe=$(dirname "$probe"); done
  disk_gib=$(df -Pk "$probe" 2>/dev/null | awk 'NR==2 {print int($4 / 1048576)}')
  [ -n "$disk_gib" ] || disk_gib=0
  min_cpu=$(env_get GET_OWNCLOUD_REQUIRED_CPU)
  min_ram=$(env_get GET_OWNCLOUD_REQUIRED_RAM_MIB)
  min_disk=$(env_get GET_OWNCLOUD_REQUIRED_DISK_GIB)
  result=pass
  [ "$cpu" -ge "$min_cpu" ] || result=fail
  [ "$ram_mib" -ge "$min_ram" ] || result=fail
  [ "$disk_gib" -ge "$min_disk" ] || result=fail
  cat >"$BUNDLE_DIR/readiness-report.json" <<EOF
{"scriptVersion":"$SCRIPT_VERSION","os":"$OS_ID","osVersion":"$OS_VERSION","architecture":"$ARCH","runtime":"$ENGINE","cpu":$cpu,"ramMiB":$ram_mib,"availableDiskGiB":$disk_gib,"minimum":{"cpu":$min_cpu,"ramMiB":$min_ram,"diskGiB":$min_disk},"result":"$result","firewallChanged":false,"dnsChanged":false,"removalGuidance":"Stop with the generated Compose command; package or controller removal is never automatic."}
EOF
  chmod 600 "$BUNDLE_DIR/readiness-report.json"
  if [ "$result" = fail ] && [ "$(env_get GET_OWNCLOUD_PURPOSE)" = production ]; then
    die "Host is below the calculated minimum; see readiness-report.json"
  fi
  [ "$result" = pass ] || note "WARNING: evaluation host is below the calculated minimum"
}

record_eula() {
  [ "$ACCEPT_EULA" = true ] || die "EULA acceptance is required. Review $EULA_URL and use --accept-eula."
  user_name=$(id -un 2>/dev/null || printf unknown)
  host_name=$(hostname 2>/dev/null || printf unknown)
  timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  line="$timestamp user=$user_name host=$host_name ocis=$OCIS_VERSION eula_sha256=$EULA_SHA256 sections=no-warranties,limitation-of-liability"
  audit_dir=/var/log/get-owncloud
  audit_file=$audit_dir/eula-acceptance.log
  if [ "$(id -u)" -eq 0 ]; then
    mkdir -p "$audit_dir"; chmod 700 "$audit_dir"
  else
    audit_dir=$BUNDLE_DIR/.get-owncloud; audit_file=$audit_dir/eula-acceptance.log
    mkdir -p "$audit_dir"; chmod 700 "$audit_dir"
  fi
  if [ ! -f "$audit_file" ] || ! grep -F "ocis=$OCIS_VERSION eula_sha256=$EULA_SHA256" "$audit_file" >/dev/null 2>&1; then
    printf '%s\n' "$line" >>"$audit_file"
  fi
  chmod 600 "$audit_file"
  note "EULA acceptance recorded locally in $audit_file; it is not transmitted."
}

configure_update_timer() {
  [ "$(env_get GET_OWNCLOUD_AUTO_SECURITY_UPDATES)" = true ] || return 0
  if [ "$ENGINE" != docker ]; then
    note "Automatic update timer is unavailable for the $ENGINE Community Preview runtime."
    return 0
  fi
  recipient=$(env_get GET_OWNCLOUD_BACKUP_RECIPIENT)
  [ -n "$recipient" ] || die "Automatic updates require an operator-controlled backup recipient"
  case "$BUNDLE_DIR" in *[!A-Za-z0-9_./-]*) die "Scheduled updates require a bundle path without spaces or shell metacharacters" ;; esac
  unit_id=$(printf '%s' "$BUNDLE_DIR" | sha256sum | cut -c1-12)
  if ! has systemctl; then
    [ -x /usr/sbin/cron ] || [ -x /usr/sbin/crond ] || die "Automatic updates require systemd or cron"
    cron_file=$(mktemp); trap 'rm -f "$cron_file"' EXIT HUP INT TERM
    printf '17 3 * * * root /bin/sh "%s/scripts/update-service.sh" --bundle-dir "%s"\n' "$BUNDLE_DIR" "$BUNDLE_DIR" >"$cron_file"
    run_privileged install -m 0644 "$cron_file" "/etc/cron.d/get-owncloud-update-$unit_id"
    rm -f "$cron_file"; trap - EXIT HUP INT TERM; note "Automatic security patch cron enabled: get-owncloud-update-$unit_id"; return 0
  fi
  service="get-owncloud-update-$unit_id.service"
  timer="get-owncloud-update-$unit_id.timer"
  temp_units=$(mktemp -d)
  trap 'rm -rf "$temp_units"' EXIT HUP INT TERM
  cat >"$temp_units/$service" <<EOF
[Unit]
Description=Apply eligible ownCloud Infinite Scale security patches
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/bin/sh "$BUNDLE_DIR/scripts/update-service.sh" --bundle-dir "$BUNDLE_DIR"
EOF
  cat >"$temp_units/$timer" <<EOF
[Unit]
Description=Daily ownCloud Infinite Scale security patch check

[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true
Unit=$service

[Install]
WantedBy=timers.target
EOF
  run_privileged install -m 0644 "$temp_units/$service" "/etc/systemd/system/$service"
  run_privileged install -m 0644 "$temp_units/$timer" "/etc/systemd/system/$timer"
  run_privileged systemctl daemon-reload
  run_privileged systemctl enable --now "$timer"
  rm -rf "$temp_units"; trap - EXIT HUP INT TERM
  note "Automatic security patch timer enabled: $timer"
}

podman_rootless_preflight() {
  [ "$ENGINE" = podman ] && [ "$(id -u)" -ne 0 ] || return 0
  for port_name in HTTP_PORT HTTPS_PORT; do
    port_value=$(env_get "$port_name")
    [ "$port_value" -ge 1024 ] || die "Rootless Podman requires unprivileged ports; $port_name=$port_value"
  done
  image=$(env_get OCIS_IMAGE)
  for path in "$config_dir" "$data_dir"; do
    podman run --rm --userns keep-id:uid=1000,gid=1000 --entrypoint /bin/sh -v "$path:/get-owncloud-preflight:rw" "$image" \
      -ec 'touch /get-owncloud-preflight/.write-test && rm /get-owncloud-preflight/.write-test' ||
      die "Rootless Podman cannot write bind mount: $path; fix UID/GID/SELinux mapping or choose rootful"
  done
}

verify_bundle
resource_preflight
note "EULA: $EULA_URL"
note "EULA sections acknowledged: No warranties; Limitation of liability"
record_eula
config_dir=$(bundle_path "$(env_get OCIS_CONFIG_DIR)")
data_dir=$(bundle_path "$(env_get OCIS_DATA_DIR)")
[ -f "$BUNDLE_DIR/scripts/runtime-common.sh" ] || die "Bundle is missing scripts/runtime-common.sh"
# shellcheck source=/dev/null
. "$BUNDLE_DIR/scripts/runtime-common.sh"
get_owncloud_prepare_storage "$ENGINE" "$config_dir" "$data_dir"

if [ "$NO_START" = true ]; then
  note "Bundle verified and prepared; --no-start prevented service changes."
  exit 0
fi
get_owncloud_runtime_setup "$ENGINE" "$BUNDLE_DIR"
(cd "$BUNDLE_DIR" && get_owncloud_compose_validate)
(cd "$BUNDLE_DIR" && get_owncloud_compose pull)
podman_rootless_preflight
(cd "$BUNDLE_DIR" && get_owncloud_compose up -d --remove-orphans)
domain=$(env_get OCIS_DOMAIN); port=$(env_get HTTPS_PORT)
health_args="--url https://$domain:$port/healthz --domain $domain --port $port"
[ "$(env_get GET_OWNCLOUD_PURPOSE)" != evaluation ] || health_args="$health_args --evaluation-insecure"
# shellcheck disable=SC2086
sh "$BUNDLE_DIR/scripts/healthcheck.sh" $health_args
configure_update_timer
note "ownCloud Infinite Scale $OCIS_VERSION is running at https://$domain:$port/"
