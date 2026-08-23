#!/bin/sh
set -eu

BUNDLE_DIR=.
ACCEPT_EULA=false
ARGOCD=false
DRY_RUN=false
SYNC=false
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --bundle-dir) BUNDLE_DIR=$2; shift ;;
    --accept-eula) ACCEPT_EULA=true ;;
    --argocd) ARGOCD=true ;;
    --sync) SYNC=true ;;
    --dry-run) DRY_RUN=true ;;
    --help) printf '%s\n' "Usage: deploy.sh [--bundle-dir DIR] --accept-eula [--argocd] [--sync] [--dry-run]"; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

[ -d "$BUNDLE_DIR" ] || die "Bundle directory does not exist"
BUNDLE_DIR=$(cd "$BUNDLE_DIR" && pwd -P)
for tool in kubectl helm sha256sum; do command -v "$tool" >/dev/null 2>&1 || die "$tool is required; run Part 1 first"; done
(cd "$BUNDLE_DIR" && sha256sum -c manifest.sha256)
[ "$ACCEPT_EULA" = true ] || die "EULA acceptance is required after reviewing eula-acknowledgement.json"
grep -q '"chartVersion": "0.7.0"' "$BUNDLE_DIR/deployment.lock.json" || die "Chart lock is not 0.7.0"
grep -q '"ocisVersion": "7.1.4"' "$BUNDLE_DIR/deployment.lock.json" || die "oCIS lock is not 7.1.4"
kubectl config current-context
namespace=owncloud
kubectl get namespace "$namespace" >/dev/null 2>&1 ||
  die "Namespace $namespace must be created and approved before deployment"
tls_secret=$(sed -n 's/^    - secretName: "\([^"]*\)"/\1/p' "$BUNDLE_DIR/values.yaml" | head -n 1)
[ -z "$tls_secret" ] || kubectl -n "$namespace" get secret "$tls_secret" >/dev/null 2>&1 ||
  die "Referenced TLS secret does not exist in namespace $namespace: $tls_secret"
ldap_secret=$(sed -n 's/^  ldapSecretRef: "\([^"]*\)"/\1/p' "$BUNDLE_DIR/values.yaml" | head -n 1)
if [ -n "$ldap_secret" ]; then
  kubectl -n "$namespace" get secret "$ldap_secret" -o jsonpath='{.data.reva-ldap-bind-password}' | grep -q . ||
    die "LDAP secret must contain reva-ldap-bind-password: $ldap_secret"
fi

helm repo add owncloud https://owncloud.github.io/ocis-charts/ --force-update >/dev/null
helm repo update owncloud >/dev/null
helm template owncloud owncloud/ocis --version 0.7.0 --namespace "$namespace" -f "$BUNDLE_DIR/values.yaml" >/dev/null
[ "$DRY_RUN" = false ] || { printf '%s\n' "Kubernetes render passed; dry-run made no cluster changes."; exit 0; }

timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
mkdir -p "$BUNDLE_DIR/.get-owncloud"; chmod 700 "$BUNDLE_DIR/.get-owncloud"
printf '%s chart=0.7.0 ocis=7.1.4 sections=no-warranties,limitation-of-liability\n' "$timestamp" >>"$BUNDLE_DIR/.get-owncloud/eula-acceptance.log"
chmod 600 "$BUNDLE_DIR/.get-owncloud/eula-acceptance.log"

if [ "$ARGOCD" = true ]; then
  command -v argocd >/dev/null 2>&1 || die "argocd CLI is required; run Part 1 first"
  kubectl apply -f "$BUNDLE_DIR/argocd/project.yaml"
  kubectl apply -f "$BUNDLE_DIR/argocd/application.yaml"
  if [ "$SYNC" = true ]; then argocd app sync owncloud --prune=false; else printf '%s\n' "Application created without automatic sync; review the diff before --sync."; fi
else
  helm upgrade --install owncloud owncloud/ocis --version 0.7.0 --namespace "$namespace" --create-namespace \
    -f "$BUNDLE_DIR/values.yaml" --wait --timeout 15m
fi

if [ -f "$BUNDLE_DIR/nfs-verifier.yaml" ]; then
  kubectl delete job owncloud-nfs42-verifier -n "$namespace" --ignore-not-found
  kubectl apply -f "$BUNDLE_DIR/nfs-verifier.yaml"
  kubectl wait --for=condition=complete job/owncloud-nfs42-verifier -n "$namespace" --timeout=3m || {
    kubectl logs job/owncloud-nfs42-verifier -n "$namespace" || true
    die "Effective NFSv4.2 verification failed"
  }
fi
printf '%s\n' "Kubernetes Community Preview deployed at chart 0.7.0 / oCIS 7.1.4; issue #6 remains open."
