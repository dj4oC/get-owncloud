# Update policy

The default enables security automation with a 24-hour observation delay. Eligibility is intentionally narrow:

- patch-level release within the same pinned minor version;
- upstream classification explicitly says security-related;
- no migration, storage schema, IDM schema, compatibility or breaking-change marker;
- verified backup, health tests and rollback path available.

Minor/major releases, storage/IDM changes and uncertain classifications always require manual approval.
Breaking changes are never automatic. Users can disable automatic security application while retaining
daily detection and reports.

Every decision records the source release notes, classifier version and reason. Unknown means manual.
