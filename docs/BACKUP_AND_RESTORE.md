# Backup and restore contract

Automatic security updates and production upgrades require a recent verified backup.

## Backup set

- deployment profile, lock, readiness/sizing reports and update policy;
- rendered configuration and environment files;
- generated secrets, encrypted at rest with a user-controlled key or external secret manager;
- persistent oCIS metadata/data layout and selected external-storage references;
- a data-directory structure manifest, ownership/mode metadata and component versions.

Backups default outside the live deployment directory. The manifest includes checksums but never plaintext
secrets. A backup is not “ready” until the tool can decrypt the secret payload, validate configuration and
complete a restore rehearsal into an isolated target.

## Update transaction

1. Classify the release and reject minor/major, schema, storage or IDM changes from automatic handling.
2. Create and verify the backup.
3. Apply only an eligible same-minor patch security update after the configured 24-hour delay.
4. Run oCIS health, login, upload/download and selected integration checks.
5. Roll back automatically on failure only when the release is explicitly rollback-safe; otherwise stop
   before applying and require a reviewed migration plan.

Restore instructions and recovery ownership must be included in every production bundle.
