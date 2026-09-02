# Ansible contract

The `get_owncloud` role operates the locked Compose bundle; it does not maintain an independent oCIS
variable model. It verifies Part 1 and the bundle, requires explicit EULA approval, uses
`community.docker.docker_compose_v2` for Docker, invokes the same locked Compose project for Podman
Community Preview, and performs a hostname/SNI-aware health check. Podman change detection compares the
project container IDs before and after apply; CI requires the second apply to report `changed=0`.

Secrets are external references or encrypted with Ansible Vault. Tasks handling secrets use `no_log: true`.
Generated plaintext secrets are never placed in inventory or CI output.

## Distribution Support Matrix

| Distribution | Status | Docker Support | Podman Support | Notes |
| --- | --- | --- | --- | --- |
| Ubuntu 22.04 LTS | Production | Full | Full (rootless) | Primary production target |
| Ubuntu 24.04 LTS | Production | Full | Full (rootless) | Primary production target |
| Debian 12 | Production | Full | Full (rootless) | Tier 1 support |
| RHEL 9 | Community Preview | Full | Full (rootful) | Requires subscription for Docker |
| Rocky Linux 9 | Community Preview | Full | Full (rootful) | Docker via EPEL |
| AlmaLinux 9 | Community Preview | Full | Full (rootful) | Docker via EPEL |
| CentOS Stream 9 | Community Preview | Full | Full (rootful) | Docker via EPEL |
| Fedora (latest) | Evaluation | Full | Full (rootless) | Part 1 adapter must pass |
| openSUSE (latest) | Evaluation | Full | Full (rootless) | Part 1 adapter must pass |
| SLES 15 | Evaluation | Full | Full (rootful) | Part 1 adapter must pass |

**Support Levels**:
- **Production**: Full CI testing, production-ready claim, included in launch gates
- **Community Preview**: CI testing, visible warning, no production support claim
- **Evaluation**: Basic Part 1 adapter verification, not included in production matrix

## Promotion Criteria

A distribution graduates from Evaluation to Community Preview when:
1. Part 1 adapter passes on clean install
2. Docker Compose double-apply idempotence verified
3. Podman Compose double-apply idempotence verified (if applicable)
4. Backup/restore lifecycle passes
5. Health checks pass

A distribution graduates from Community Preview to Production when:
1. All Community Preview criteria met
2. Rootless Podman evidence passes (if applicable)
3. SELinux/AppArmor verification passes (if applicable)
4. Named maintainer accepts ownership
5. Production launch gate passes

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
