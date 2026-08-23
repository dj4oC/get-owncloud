# Deploy ownCloud by Kiteworks

`get-owncloud` is the implementation workspace for a one-page ownCloud Infinite Scale deployment hub.
It keeps one target-neutral profile and renders two deployment families:

| Family | Native deployment | Management wrapper |
| --- | --- | --- |
| Single host | Docker Compose or Podman Compose | Ansible |
| Kubernetes | Helm | Argo CD |

The browser and CLI validate the same profile, calculate system recommendations and generate a local,
inspectable ZIP/directory with checksums, source locks, generated secrets and lifecycle scripts.

## URLs

- Development: <https://amamus.github.io/get-owncloud/>
- Intended production: <https://get.owncloud.com/>
- Production bootstrap: <https://get.owncloud.com/install.sh>

The exact upstream ownCloud SVG is vendored with its source commit and hashes. The development Pages build
stays `noindex` until DNS, legal, brand-use, support and security launch gates are approved.

## Fixed safety policy

- Collabora is the only office integration. It may be bundled or external.
- Embedded IDP/IDM is permitted for at most 20 users.
- Standard storage is the `ocis` driver on POSIX storage, or `s3ng` with POSIX metadata.
- NFS must be verified as effectively negotiated at NFSv4.2.
- PosixFS, legacy `xattr`, GPFS-specific modes and experimental/unsupported features are rejected.
- Helm and Argo CD are runnable Community Preview outputs deliberately held at chart 0.7.0 / oCIS 7.1.4.
  Issue #6 remains open and is the only place where that version boundary may be promoted.
- Runnable output requires acknowledgement of the pinned EULA, including **No warranties** and
  **Limitation of liability**.

## Part 1: Prepare your system

The local bootstrap detects the chosen stack. Missing Docker, Podman, Kubernetes, Helm, Ansible or
Argo CD client tooling is presented as an inspectable installation plan. Mutations require approval.
There is no silent `sudo`, firewall change, DNS change, controller replacement or Kubernetes-context switch.

```sh
sh scripts/install.sh --dry-run --target single-host --engine docker
```

Use `--non-interactive --install-missing --allow-sudo --accept-eula` only in automation where every
mutation and acceptance has been deliberately authorized. Without a TTY and without those flags, the
script fails closed.

## Generate and deploy

```sh
npm ci --ignore-scripts
SOURCE_DATE_EPOCH=0 node src/cli.mjs render \
  examples/evaluation-docker-collabora.json /tmp/owncloud-bundle \
  --accept-eula --secrets-file test/fixtures/e2e-secrets.json
sh /tmp/owncloud-bundle/install.sh --bundle-dir /tmp/owncloud-bundle --accept-eula
```

Use your own secret file outside source control. Browser generation performs the same work locally and
does not transmit profile data or secrets. The runtime repeats EULA acknowledgement intentionally.

## Verification

All JavaScript dependencies are development/test-only and locked in `package-lock.json`:

```sh
npm ci --ignore-scripts
npm run verify
npm run test:e2e
```

`Full deployment E2E` runs the actual pinned oCIS 8.2.0 and Collabora containers on Ubuntu 22.04 and
24.04, verifies health and WebDAV, restarts them, then proves backup/restore recovery. A separate
rootless-Podman job performs real WebDAV persistence/recovery and Podman Ansible double-apply. The
workflow also runs deterministic Part 1 adapters across the retained distro matrix, validates chart
0.7.0 against the pinned upstream schema, proves Helm/Argo value equivalence, and applies the Docker
Ansible wrapper twice. Browser generation, ZIP integrity, keyboard operation and axe WCAG 2.1 AA checks
run in that same workflow; the `Full E2E code gate` job fails unless every matrix job succeeds.
Every `v*` release tag calls this complete workflow before generating and attesting release evidence.
Daily upstream discovery records source, EULA and same-minor release drift and opens a deduplicated review
issue; it never changes a deployment pin automatically.

The repository structure, ownership and delivery sequence are described in [ROADMAP.md](ROADMAP.md).
Architecture and policy details are under [docs/](docs/ARCHITECTURE.md).

## Status

Docker output is production-gated code, not a blanket production certification. Today’s live runtime
claim is limited to Docker on Ubuntu 22.04/24.04; other retained platforms graduate only with the evidence
listed in `docs/PLATFORM_SUPPORT.md`. The development site and
release remain gated until the external approvals in `docs/LAUNCH_GATES.md` are complete. Podman and the
7.1.4 Kubernetes family remain Community Preview exactly as recorded in `catalog/compatibility.json`.
