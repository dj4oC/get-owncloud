# Kubernetes and Helm contract

## Evaluation versus production

K3s remains a retained **UX/smoke-test evaluation-only** profile, but Part 1 deliberately refuses to
install it while issue #6 is open. Its default local-path provisioner and Traefik ingress would not prove
NFSv4.2 or production ingress/TLS behavior. The current 7.1.4 Community Preview therefore requires an
existing compatible cluster; a separately approved K3s adapter remains an explicit #6 exit item.

## Cluster requirements

| Requirement | Contract |
| --- | --- |
| Kubernetes | 1.28 or newer for the current chart repository contract; catalogue may raise this |
| Helm | 3.x, pinned and checksum/signature verified |
| CNI | Calico, Cilium or Flannel are retained candidates; no production claim until the live matrix passes |
| Storage | StorageClass/PV compatible with the selected policy; NFS must negotiate v4.2 |
| Ingress/TLS | Existing supported ingress plus a trusted certificate in production |

The comment proposed Kubernetes 1.27; the current official chart README states 1.28+, so the safer
version-pinned contract uses 1.28 and tests it rather than weakening to 1.27.

## Held chart compatibility (#6)

The pinned official Chart.yaml reports chart `0.7.0` with appVersion `7.1.4`. The generator emits a
runnable Community Preview at exactly those versions; it never labels that output as oCIS 8.2 or
production. Issue #6 remains open by project decision and owns any future promotion. CI checks the
generated override against the pinned upstream `values.schema.json`, runs `helm lint`/`helm template`, and
proves that direct Helm and Argo CD use semantically identical values.

The 7.1.4 preview bundles external Collabora configuration but does not pretend the oCIS chart bundles a
Collabora server. External identity requires OIDC and LDAP plus a pre-created bind-password Secret.

## TLS

- Production default: bring an existing trusted certificate/secret.
- ACME/cert-manager: optional only after its mapping and tests pass; evaluation may use it.
- Self-signed: evaluation only with iframe/Collabora warnings.

## Community Preview exit

- [x] Chart 0.7.0 and its declared oCIS 7.1.4 are pinned together for Community Preview.
- [x] Helm lint, template, values-schema and Helm/Argo equivalence checks exist in required CI.
- [ ] Ephemeral live-cluster smoke tests pass on every promoted Kubernetes platform.
- [x] An in-pod NFSv4.2 effective-mount verifier is generated where NFS is selected.
- [ ] That verifier passes on the advertised real-cluster storage matrix.
- [ ] Production ingress/TLS journey passes.
- [ ] All visible presets pass resource and policy checks.
- [ ] Chart/oCIS owner approves the support statement.

The configurator reads maturity from `catalog/compatibility.json` and shows it before generation.
