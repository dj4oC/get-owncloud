# Kubernetes and Helm contract

## Evaluation versus production

K3s is an installable **UX/smoke-test evaluation-only** profile. Its default local-path provisioner and
Traefik ingress do not prove NFSv4.2 or production ingress/TLS behavior. Production requires an existing
compatible cluster or a separately approved installer adapter.

## Cluster requirements

| Requirement | Contract |
| --- | --- |
| Kubernetes | 1.28 or newer for the current chart repository contract; catalogue may raise this |
| Helm | 3.x, pinned and checksum/signature verified |
| CNI | Calico, Cilium or Flannel in the tested matrix |
| Storage | StorageClass/PV compatible with the selected policy; NFS must negotiate v4.2 |
| Ingress/TLS | Existing supported ingress plus a trusted certificate in production |

The comment proposed Kubernetes 1.27; the current official chart README states 1.28+, so the safer
version-pinned contract uses 1.28 and tests it rather than weakening to 1.27.

## Chart compatibility

The official `main` Chart.yaml currently reports chart `0.7.0` with appVersion `7.1.4`. It cannot be
presented as an oCIS 8.2 production baseline. The compatibility catalogue therefore blocks runnable
8.2 Helm/Argo CD output until the latest chart compatible with the pinned oCIS release is found, locked,
schema-validated and approved. Compose and Helm may never silently target different oCIS versions.

## TLS

- Production default: bring an existing trusted certificate/secret.
- ACME/cert-manager: optional only after its mapping and tests pass; evaluation may use it.
- Self-signed: evaluation only with iframe/Collabora warnings.

## Community Preview exit

- [ ] Compatible chart and oCIS versions are pinned together.
- [ ] Helm lint, template and values-schema checks pass.
- [ ] Ephemeral smoke tests pass.
- [ ] Real-cluster NFSv4.2 in-pod effective-mount test passes where NFS is selected.
- [ ] Production ingress/TLS journey passes.
- [ ] All visible presets pass resource and policy checks.
- [ ] Chart/oCIS owner approves the support statement.

The configurator reads maturity from `catalog/compatibility.json` and shows it before generation.
