# Backup and restore contract

Automatic security updates and production upgrades require a recent verified backup.

The browser defaults automatic eligible security patches on and requires an operator-controlled `age`
or SSH Ed25519 public recipient. Operators who have not created and escrowed the matching recovery
identity must explicitly disable automatic updates; the production example does this deliberately.

## Backup set

- deployment profile, lock, readiness/sizing reports and update policy;
- rendered configuration and environment files;
- generated secrets, encrypted at rest with a user-controlled key or external secret manager;
- persistent oCIS metadata/data layout and selected external-storage references;
- a data-directory structure manifest, ownership/mode metadata and component versions.

The included script stops the whole Compose project before copying data so configuration and metadata are
consistent. Backups default outside the live deployment directory, receive a SHA-256 sidecar and require
operator-controlled `age` encryption in production. Unencrypted output needs an explicit evaluation-only
flag. Restore verifies the checksum, rejects unsafe archive paths and symbolic links, enforces the exact
oCIS version, retains the pre-restore data, and starts only when requested.

The required runtime workflow proves upload → restart persistence → stopped backup → delete → restore →
download recovery. Operators must still rehearse their own external object storage, secret manager and
retention policy before production.

## Update transaction

1. Classify the release and reject minor/major, schema, storage or IDM changes from automatic handling.
2. Create and verify the backup.
3. Apply only an eligible same-minor patch security update after the configured 24-hour delay.
4. Run oCIS health, login, upload/download and selected integration checks.
5. Roll back automatically on failure only when the release is explicitly rollback-safe; otherwise stop
   before applying and require a reviewed migration plan.

For Docker hosts, Part 1 installs a uniquely named daily systemd timer—or a root-owned `/etc/cron.d`
fallback on a non-systemd host—only after the deployment, backup recipient, update tooling and explicit
sudo approval have passed. The systemd timer is persistent and randomized; a current or ineligible feed
is a successful no-op. Podman remains Community Preview and does not receive a privileged automatic-update
timer.

Restore instructions and recovery ownership must be included in every production bundle.
