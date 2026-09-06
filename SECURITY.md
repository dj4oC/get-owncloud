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
that capability when `no-new-privileges` is set. 

### Runtime protections applied:
- **Capability dropping**: All other capabilities are explicitly dropped with `cap_drop: [ALL]`
- **Read-only filesystem**: The container runs with `read_only: true` where compatible
- **Secure tmpfs**: `/tmp` is mounted as a secure tmpfs with `noexec,nosuid` options
- **Minimal privileges**: Only the essential `MKNOD` capability is added

### Security considerations:
- The `MKNOD` capability allows creation of device nodes, which could potentially be used for:
  - Device-based attacks
  - Kernel interaction that could lead to privilege escalation
  - Information disclosure through device manipulation

- This exception is made because Collabora's upstream jail implementation requires `MKNOD` for proper operation.

### Review requirements:
This narrow exception is regression-tested and **must be re-reviewed whenever the pinned Collabora image changes**.
Every other generated service keeps `no-new-privileges:true`. The Collabora container remains the only service
with this security exception.

### Verification:
- CI checks verify that the Collabora container has exactly the documented capabilities and no others
- The pinned Collabora image SHA256 is tracked and any changes trigger a security review
- Runtime behavior is tested to ensure the jail implementation works correctly with the minimal capabilities
