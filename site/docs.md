# Deploy ownCloud by Kiteworks

Prepare the selected Docker, Podman, Kubernetes, Helm, Ansible or Argo CD tooling, configure one
target-neutral profile, then validate policy, sizing and EULA acknowledgement before generation.

## Deployment families

- Single host: Docker or Podman; Ansible wraps the same locked Compose bundle.
- Kubernetes: Helm; Argo CD wraps the same values. This path is Community Preview and currently blocked
  for oCIS 8.2 because the published chart declares appVersion 7.1.4.

## Hard constraints

- Embedded IDP/IDM: maximum 20 users.
- Office: Collabora only, bundled or external.
- Storage: standard `ocis` on POSIX, `s3ng` with POSIX metadata, and effective NFSv4.2 only.
- PosixFS, xattr, GPFS-specific and experimental/unsupported options are rejected.
- Production sizing is a recommendation, never a guarantee; representative load testing is mandatory.
- Runnable output requires the pinned EULA acknowledgement, including No warranties and Limitation of liability.

See the [repository README](../README.md) and [architecture](../docs/ARCHITECTURE.md).
