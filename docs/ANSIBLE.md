# Ansible contract

The `get_owncloud` role operates the locked Compose bundle; it does not maintain an independent oCIS
variable model. It verifies Part 1 and the bundle, requires explicit EULA approval, uses
`community.docker.docker_compose_v2` for Docker, invokes the same locked Compose project for Podman
Community Preview, and performs a hostname/SNI-aware health check. Podman change detection compares the
project container IDs before and after apply; CI requires the second apply to report `changed=0`.

Secrets are external references or encrypted with Ansible Vault. Tasks handling secrets use `no_log: true`.
Generated plaintext secrets are never placed in inventory or CI output.

## Distribution order

1. Debian 12 and Ubuntu 22.04/24.04.
2. RHEL, Rocky, AlmaLinux and CentOS Stream 9.
3. Fedora, openSUSE and SLES after their Part 1 adapters pass.

## Molecule/runtime scenarios

- Single-node Docker Compose convergence, live health and a required second apply with `changed=0`.
- Single-node Podman only while Community Preview, with rootless/rootful persistence criteria.
- Multi-node Compose remains a later topology inside the retained scope.

Podman promotion requires Docker test parity, rootless ports >=1024, explicit rootful ports <1024,
systemd, SELinux/AppArmor and the supported platform matrix.
