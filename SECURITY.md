# Security policy

Do not report vulnerabilities in public issues. Use the established ownCloud security process at
<https://security.owncloud.com/>.

The bootstrap, prerequisite catalogues, checksums, EULA audit records and generated manifests are
security-sensitive. Reports should include a redacted `readiness-report.json` and manifest, never
credentials, tokens, private URLs or generated secret material.

Security review is a blocking production launch gate.

## Collabora runtime exception

The bundled Collabora CODE container is not privileged and receives only the `MKNOD` capability required
by its upstream jail implementation. It intentionally does not set `no-new-privileges`: Collabora starts as
an unprivileged image user but requires its capability-bearing helper during jail setup, and Linux suppresses
that capability when `no-new-privileges` is set. Every other generated service keeps
`no-new-privileges:true`. This narrow exception is regression-tested and must be re-reviewed whenever the
pinned Collabora image changes.
