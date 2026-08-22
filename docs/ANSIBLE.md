# Ansible contract

The Ansible wrapper operates the locked Compose bundle; it does not maintain an independent oCIS variable
model. It uses `community.docker.docker_compose_v2` to apply that bundle, reconciling the maintained module
recommendation with the thin-wrapper architecture.

Secrets are external references or encrypted with Ansible Vault. Tasks handling secrets use `no_log: true`.
Generated plaintext secrets are never placed in inventory or CI output.

## Distribution order

1. Debian 12 and Ubuntu 22.04/24.04.
2. RHEL, Rocky, AlmaLinux and CentOS Stream 9.
3. Fedora, openSUSE and SLES after their Part 1 adapters pass.

## Molecule/runtime scenarios

- Single-node Docker Compose convergence, second apply and update.
- Single-node Podman only while Community Preview, with rootless/rootful persistence criteria.
- Multi-node Compose remains a later topology inside the retained scope.

Podman promotion requires Docker test parity, rootless ports >=1024, explicit rootful ports <1024,
systemd, SELinux/AppArmor and the supported platform matrix.
