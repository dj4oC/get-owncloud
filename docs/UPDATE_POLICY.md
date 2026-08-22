# Update policy

Production Docker profiles default to security automation with a 24-hour observation delay once an
operator-controlled backup recipient is supplied. Eligibility is intentionally narrow:

- patch-level release within the same pinned minor version;
- upstream classification explicitly says security-related;
- no migration, storage schema, IDM schema, compatibility or breaking-change marker;
- verified backup, health tests and rollback path available.

Minor/major releases, storage/IDM changes and uncertain classifications always require manual approval.
Breaking changes are never automatic. Users can disable automatic security application while retaining
daily detection and reports.

Every decision records the source release notes, classifier version and reason. Unknown means manual.

Part 1 creates a uniquely named persistent systemd timer when systemd is available. On Docker hosts
without systemd, it installs the equivalent root-owned `/etc/cron.d` entry only when a cron daemon is
present. Both scheduler paths require explicit privilege approval and a metacharacter-free absolute
bundle path. Podman remains Community Preview and requires an operator-managed scheduler.
