# Platform support and Part 1 behavior

The breadth requested by the RFC remains visible. Tiers state test evidence; they do not silently claim
support for an untested platform.

| Tier | Platform | Package path | Automated evidence now | Production runtime claim |
| --- | --- | --- | --- | --- |
| 1 | Ubuntu 22.04 LTS | apt; Docker vendor repo; Podman distro package | Deterministic Part 1 plus full Docker/Collabora/WebDAV/backup/restore lifecycle | Docker after launch gates |
| 1 | Ubuntu 24.04 LTS | apt; Docker vendor repo; Podman distro package | Same Docker lifecycle; rootless Podman lifecycle; Docker and Podman Ansible double-apply | Docker after launch gates; Podman preview |
| 1 | Debian 12 | apt; Docker vendor repo; Podman distro package | Deterministic, non-mutating Part 1 container adapter | None until live runtime evidence |
| 1 | RHEL 9 | dnf; approved vendor/distro sources | UBI 9 deterministic Part 1 contract | None until subscribed-host runtime/SELinux evidence |
| 1 | CentOS Stream 9 | dnf; approved vendor/distro sources | Deterministic Part 1 container adapter | None until live runtime/SELinux evidence |
| 1 | Rocky Linux 9 | dnf; approved vendor/distro sources | Deterministic Part 1 container adapter | None until live runtime/SELinux evidence |
| 1 | AlmaLinux 9 | dnf; approved vendor/distro sources | Deterministic Part 1 container adapter | None until live runtime/SELinux evidence |
| 2 | Fedora current | dnf | Deterministic Part 1 container adapter | None |
| 2 | openSUSE Tumbleweed | zypper | Deterministic Part 1 container adapter | None |
| 2 | SLES 15 SP6 | zypper | Static adapter contract; licensed-runner evidence pending | None |

Vendor repositories are preferred where they provide a verifiable supported version. Distribution
packages remain an explicit fallback, especially for Podman, and are accepted only when the version
contract passes. Every adapter shows repository, key fingerprint, packages and commands before approval.

## Podman decision tree

Rootless is preferred when all requested ports are at least 1024 and bind-mount UID/GID preflight passes.
Tests must upload, persist, restart and download data; “container started” is insufficient. If port or
ownership checks fail, the UI explains the problem and offers an explicit rootful path. Production on
ports 80/443 defaults to rootful or an existing privileged reverse proxy; it never silently changes mode.

Podman remains Community Preview until Docker parity, rootless/rootful persistence, systemd integration,
SELinux/AppArmor behavior and the full platform matrix pass.

## NFS

Part 1 checks the effective host mount from `/proc/self/mountinfo`/`findmnt`, not only requested options.
Compose, Podman and Ansible paths block runnable output unless NFSv4.2 is proven. Kubernetes performs
the equivalent check in a pod as described in `KUBERNETES.md`.
