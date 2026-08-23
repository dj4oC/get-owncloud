# Deploy ownCloud by Kiteworks

Prepare the selected Docker, Podman, Kubernetes, Helm, Ansible or Argo CD tooling, configure one profile,
then validate policy, system recommendations and EULA acknowledgement before downloading a local bundle.

## Deployment families

- Single host: Docker or Podman; Ansible wraps the same locked Compose bundle.
- Kubernetes: Helm; Argo CD wraps semantically identical values. This runnable Community Preview is held
  at chart 0.7.0 / oCIS 7.1.4 under open issue #6 and makes no 8.2 production claim.

## Hard constraints

- Embedded IDP/IDM: maximum 20 users; external OIDC and trusted LDAP are required above that limit.
- Office: Collabora only, bundled or external.
- Storage: standard `ocis` on POSIX, `s3ng` with POSIX metadata, and effective NFSv4.2 only.
- PosixFS, xattr, GPFS-specific and experimental/unsupported options are rejected.
- Production sizing is a recommendation, never a guarantee; representative load testing is mandatory.
- Runnable output requires the pinned EULA acknowledgement, including No warranties and Limitation of liability.

## Generated evidence

Every bundle includes the normalized profile, sizing report, source/version lock, EULA record, SHA-256
manifest and target-specific deployment files. Single-host bundles also include health, stopped-state
backup, verified restore and eligible-security-update scripts. Browser computation and secret generation
are local; the site has no configuration API or analytics.

## System recommendations

The minimum describes a startup floor. The recommendation includes at least 30% visible planning headroom,
annual data growth, per-space cache, and selected Collabora, search and malware-scanning components. It is
not a guaranteed capacity. Production requires representative load and recovery testing.

The pinned evidence includes ownCloud’s 8.2 prerequisites (4 GiB starting point and 5 KiB cache per
space), Collabora-maintained requirements (2 CPU, 1 GiB plus 100 MiB per concurrent editor), and official
ClamAV requirements (1 CPU, 3–4 GiB RAM and 5 GiB free disk). Project assumptions remain labeled in the
downloaded report.

See the [repository README](../README.md) and [architecture](../docs/ARCHITECTURE.md).
