# Deploy ownCloud by Kiteworks

`get-owncloud` is the implementation workspace for a one-page ownCloud Infinite Scale deployment hub.
It keeps one target-neutral profile and renders two deployment families:

| Family | Native deployment | Management wrapper |
| --- | --- | --- |
| Single host | Docker Compose or Podman Compose | Ansible |
| Kubernetes | Helm | Argo CD |

The full scope remains committed. Delivery order controls risk; it does not remove Kubernetes, Helm,
Ansible, Argo CD, sizing, lifecycle or discoverability work. Docker/Podman is the first end-to-end path
because it has the shortest feedback loop and already has the official `ocis_full` example as its source.

## URLs

- Development: <https://amamus.github.io/get-owncloud/>
- Intended production: <https://get.owncloud.com/>
- Production bootstrap: <https://get.owncloud.com/install.sh>

The public development page uses a clearly marked text placeholder until the ownCloud brand asset is
approved. The final ownCloud logo and **Deploy ownCloud by Kiteworks** heading remain blocking production
requirements.

## Fixed safety policy

- Collabora is the only office integration. It may be bundled or external.
- Embedded IDP/IDM is permitted for at most 20 users.
- Standard storage is the `ocis` driver on POSIX storage, or `s3ng` with POSIX metadata.
- NFS must be verified as effectively negotiated at NFSv4.2.
- PosixFS, legacy `xattr`, GPFS-specific modes and experimental/unsupported features are rejected.
- Kubernetes remains Community Preview until a chart compatible with the pinned oCIS release exists and
  the published exit gates pass.
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

## Development

The initial implementation has no runtime npm dependencies:

```sh
npm run verify
```

The repository structure, ownership and delivery sequence are described in [ROADMAP.md](ROADMAP.md).
Architecture and policy details are under [docs/](docs/ARCHITECTURE.md).

## Status

This is an implementation foundation under RFC review. A target is advertised only at the maturity
recorded in `catalog/compatibility.json`; blocked or preview paths stay visible as roadmap scope but do
not produce misleading runnable output.
