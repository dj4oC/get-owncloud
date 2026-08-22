#!/bin/sh
set -eu

SCRIPT_VERSION="0.1.0"
OCIS_VERSION="8.2"
EULA_URL="https://raw.githubusercontent.com/owncloud/ocis/stable-8.2/assets/End-User-License-Agreement-for-ownCloud-Infinite-Scale.pdf"
EULA_SHA256="f608b0819964232648c5fb6b22a4d58310331128ad645ab158a35ef1790e2148"
TARGET="single-host"
MANAGER="direct"
ENGINE="auto"
K8S_DISTRIBUTION="existing"
PROFILE="evaluation"
DRY_RUN=false
INSTALL_MISSING=false
ALLOW_SUDO=false
ACCEPT_EULA=false
NON_INTERACTIVE=false
NO_START=false
AUTO_SECURITY_UPDATES=true
NFS_PATH=""

usage() {
  cat <<'EOF'
Usage: install.sh [options]
  --dry-run
  --target single-host|kubernetes
  --manager direct|ansible|argocd
  --engine auto|docker|podman
  --kubernetes-distribution existing|k3s
  --profile evaluation|production-single-host|production-kubernetes
  --ocis-version VERSION
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

while [ "$#" -gt 0 ]; do
  case "$1" in
    --help) usage; exit 0 ;;
    --dry-run) DRY_RUN=true ;;
    --target) [ "$#" -ge 2 ] || die "--target requires a value"; TARGET=$2; shift ;;
    --manager) [ "$#" -ge 2 ] || die "--manager requires a value"; MANAGER=$2; shift ;;
    --engine) [ "$#" -ge 2 ] || die "--engine requires a value"; ENGINE=$2; shift ;;
    --kubernetes-distribution) [ "$#" -ge 2 ] || die "--kubernetes-distribution requires a value"; K8S_DISTRIBUTION=$2; shift ;;
    --profile) [ "$#" -ge 2 ] || die "--profile requires a value"; PROFILE=$2; shift ;;
    --ocis-version) [ "$#" -ge 2 ] || die "--ocis-version requires a value"; OCIS_VERSION=$2; shift ;;
    --install-missing) INSTALL_MISSING=true ;;
    --allow-sudo) ALLOW_SUDO=true ;;
    --accept-eula) ACCEPT_EULA=true ;;
    --non-interactive) NON_INTERACTIVE=true ;;
    --auto-security-updates=true) AUTO_SECURITY_UPDATES=true ;;
    --auto-security-updates=false) AUTO_SECURITY_UPDATES=false ;;
    --nfs-path) [ "$#" -ge 2 ] || die "--nfs-path requires a value"; NFS_PATH=$2; shift ;;
    --no-start) NO_START=true ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

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
for candidate in apt-get dnf zypper; do
  if has "$candidate"; then PKG_MANAGER=$candidate; break; fi
done

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
  if [ "$TARGET" = "single-host" ]; then
    if [ "$ENGINE" = auto ]; then
      if has docker; then ENGINE=docker; elif has podman; then ENGINE=podman; else ENGINE=docker; fi
    fi
    printf '%s\n' "$ENGINE"
  else
    printf '%s\n' kubectl helm
  fi
  [ "$MANAGER" != ansible ] || printf '%s\n' ansible
  [ "$MANAGER" != argocd ] || printf '%s\n' argocd
}

tool_present() {
  case "$1" in
    docker) has docker && docker compose version >/dev/null 2>&1 ;;
    podman) has podman && podman compose version >/dev/null 2>&1 ;;
    kubectl) has kubectl ;;
    helm) has helm ;;
    ansible) has ansible && has ansible-galaxy ;;
    argocd) has argocd ;;
    *) return 1 ;;
  esac
}

package_names() {
  tool=$1
  case "$PKG_MANAGER:$tool" in
    apt-get:docker) printf '%s\n' "docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin" ;;
    apt-get:podman) printf '%s\n' "podman podman-compose" ;;
    apt-get:kubectl) printf '%s\n' "kubectl" ;;
    apt-get:helm) printf '%s\n' "helm" ;;
    apt-get:ansible) printf '%s\n' "ansible-core" ;;
    apt-get:argocd) printf '%s\n' "argocd" ;;
    dnf:docker) printf '%s\n' "docker-ce docker-ce-cli containerd.io docker-compose-plugin" ;;
    dnf:podman) printf '%s\n' "podman podman-compose" ;;
    dnf:kubectl) printf '%s\n' "kubectl" ;;
    dnf:helm) printf '%s\n' "helm" ;;
    dnf:ansible) printf '%s\n' "ansible-core" ;;
    dnf:argocd) printf '%s\n' "argocd" ;;
    zypper:docker) printf '%s\n' "docker docker-compose" ;;
    zypper:podman) printf '%s\n' "podman podman-compose" ;;
    zypper:kubectl) printf '%s\n' "kubectl" ;;
    zypper:helm) printf '%s\n' "helm" ;;
    zypper:ansible) printf '%s\n' "ansible-core" ;;
    zypper:argocd) printf '%s\n' "argocd" ;;
    *) return 1 ;;
  esac
}

install_tool() {
  tool=$1
  packages=$(package_names "$tool") || die "No approved $tool adapter for $OS_ID $OS_VERSION ($ARCH)"
  source_kind=distribution
  [ "$tool" != docker ] || [ "$PKG_MANAGER" = zypper ] || source_kind=official-docker-repository
  note "INSTALL PLAN: source=$source_kind package-manager=$PKG_MANAGER packages=$packages privilege=root verification=$tool"
  [ "$DRY_RUN" = false ] || return 0
  [ "$INSTALL_MISSING" = true ] || die "$tool is missing. Approve with --install-missing."
  confirm "Install $tool using $PKG_MANAGER packages: $packages?" || die "Installation declined"
  if [ "$tool" = docker ] && [ "$PKG_MANAGER" = apt-get ]; then
    run_privileged apt-get update
    run_privileged apt-get install -y ca-certificates curl gnupg
    temp_key=$(mktemp)
    trap 'rm -f "$temp_key"' EXIT HUP INT TERM
    curl -fsSL "https://download.docker.com/linux/$OS_ID/gpg" -o "$temp_key"
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
    run_privileged dnf install -y dnf-plugins-core
    docker_repo_os=centos
    [ "$OS_ID" != fedora ] || docker_repo_os=fedora
    run_privileged dnf config-manager --add-repo "https://download.docker.com/linux/$docker_repo_os/docker-ce.repo"
  fi
  case "$PKG_MANAGER" in
    apt-get) run_privileged apt-get update; run_privileged apt-get install -y $packages ;;
    dnf) run_privileged dnf install -y $packages ;;
    zypper) run_privileged zypper --non-interactive install $packages ;;
    *) die "No supported package manager" ;;
  esac
  tool_present "$tool" || die "$tool installation did not pass functional verification"
}

MISSING=""
for tool in $(required_tools); do
  if tool_present "$tool"; then note "READY: $tool"; else MISSING="$MISSING $tool"; install_tool "$tool"; fi
done

if [ "$TARGET" = kubernetes ] && [ "$K8S_DISTRIBUTION" = k3s ]; then
  note "K3s is evaluation-only; production requires an existing approved cluster."
  has kubectl || die "kubectl must be ready before the separately reviewed K3s adapter can run"
fi

check_nfs42() {
  path=$1
  has findmnt || die "findmnt is required to prove effective NFS version"
  options=$(findmnt -no FSTYPE,OPTIONS --target "$path" 2>/dev/null || true)
  printf '%s' "$options" | grep -Eq '(^|[ ,])(nfs4|nfs)[ ,].*(nfsvers|vers)=4\.2([ ,]|$)' ||
    die "Effective NFSv4.2 could not be proven for $path"
}

[ -z "$NFS_PATH" ] || check_nfs42 "$NFS_PATH"

record_eula() {
  [ "$ACCEPT_EULA" = true ] || die "EULA acceptance is required. Review $EULA_URL and use --accept-eula."
  [ "$DRY_RUN" = false ] || return 0
  user_name=$(id -un 2>/dev/null || printf unknown)
  host_name=$(hostname 2>/dev/null || printf unknown)
  timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  line="$timestamp user=$user_name host=$host_name ocis=$OCIS_VERSION eula_sha256=$EULA_SHA256"
  audit_dir=/var/log/get-owncloud
  audit_file=$audit_dir/eula-acceptance.log
  if [ "$(id -u)" -eq 0 ]; then
    mkdir -p "$audit_dir"; chmod 700 "$audit_dir"; printf '%s\n' "$line" >>"$audit_file"; chmod 600 "$audit_file"
  else
    audit_dir=.get-owncloud; audit_file=$audit_dir/eula-acceptance.log
    mkdir -p "$audit_dir"; chmod 700 "$audit_dir"; printf '%s\n' "$line" >>"$audit_file"; chmod 600 "$audit_file"
  fi
  note "EULA acceptance recorded locally in $audit_file; it is not transmitted."
}

note "Part 1 summary: os=$OS_ID version=$OS_VERSION arch=$ARCH target=$TARGET manager=$MANAGER missing=${MISSING:-none} auto-security-updates=$AUTO_SECURITY_UPDATES"
note "EULA: $EULA_URL"
note "EULA sections: No warranties; Limitation of liability"
if [ "$DRY_RUN" = true ]; then
  note "DRY RUN: no package, EULA audit, firewall, DNS, service or cluster change was made."
  exit 0
fi

record_eula
note "Readiness passed for selected tooling. Deployment generation follows the versioned profile policy."

if [ "$NO_START" = false ] && [ "$TARGET" = single-host ]; then
  note "Start is intentionally gated until a pinned ocis_full bundle is present and validated."
fi
