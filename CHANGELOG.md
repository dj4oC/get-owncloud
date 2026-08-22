# Changelog

## Unreleased

- Promote the locked Docker Compose renderer to oCIS 8.2.0 and sizing formula `ocis-8.2.0-sizing-v3`.
- Source Collabora and ClamAV resource increments from their maintained requirements and expose every contribution.
- Add rootless Podman socket resolution and a production Docker systemd security-update timer with encrypted pre-update backup.
- Keep Helm and Argo CD at chart 0.7.0 / oCIS 7.1.4 as Community Preview pending issue #6.
- Add production preflight, lifecycle, browser generation and runtime E2E coverage.
- Add the local browser ZIP generator, official locked ownCloud logo, structured SEO data and Markdown/LLM discovery.
- Require external OIDC plus trusted LDAP above 20 users; keep embedded IDP/IDM limited to 20.
- Add consistent stopped-state backup, checksum verification, encrypted production backup, restore and narrow security-update rollback.
- Add Docker/Collabora/WebDAV/restart/backup/restore runtime E2E, browser/axe E2E, Helm schema/equivalence and Ansible double-apply workflows.
- Retain explicit minimum/recommended vocabulary, conservative concurrency/space defaults, 30% explained headroom and mandatory production load testing.
