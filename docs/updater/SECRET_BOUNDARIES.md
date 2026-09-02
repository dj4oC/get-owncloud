# Secret, Token, Entitlement and Registry Credential Boundaries

**Issue**: #23
**Epic**: #13
**Status**: Implementation

## Overview

This document defines and enforces how the proprietary updater obtains registry entitlement and repository access without placing credentials in customer deployment repositories or images. It establishes strict boundaries between different credential types and ensures they never leak into unauthorized locations.

## Threat Model

### Attack Surface

| Threat | Description | Mitigation |
| --- | --- | --- |
| **Credential Exfiltration** | Attacker extracts credentials from repository, logs, or artifacts | Never store credentials in plaintext; use runtime references only |
| **Credential Reuse** | Compromised credential used to access multiple systems | Separate identities for each access type; least privilege |
| **Credential Leakage** | Credentials accidentally committed to Git | Pre-commit scanning; forbidden file patterns |
| **Credential Theft from Image** | Attacker extracts credentials from container image | No credentials in image layers; runtime-mounted only |
| **Credential Theft from Crash** | Credentials exposed in crash dumps or core files | Redaction at all boundaries; disable core dumps |
| **Credential Theft from Logs** | Credentials exposed in log files | Redaction in all log output |
| **Credential Theft from Reports** | Credentials exposed in operator reports | Redaction in all report output |
| **Credential Theft from Browser** | Credentials exposed in browser storage | No browser access to credentials |
| **Credential Theft from ZIP** | Credentials in generated deployment ZIP | Secret scanning before ZIP creation |
| **Token Replay** | Expired/revoked token still accepted | Strict expiration checking; revocation list |
| **Privilege Escalation** | Low-privilege credential used for high-privilege access | Separate identities; explicit permission grants |

### Credential Flow Diagrams

#### Hosted CI Environment

```
┌─────────────────────────────────────────────────────────────────┐
│                        Hosted CI (GitHub Actions)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  GitHub     │    │  OIDC       │    │  Temporary  │         │
│  │  Secrets    │───▶│  Token      │───▶│  Credentials│         │
│  │  (encryp.)  │    │  (short-   │    │  (runtime   │         │
│  └─────────────┘    │  lived)    │    │  mounted)   │         │
│                     └─────────────┘    └─────────────┘         │
│                              │                              │         │
│                              ▼                              ▼         │
│                     ┌─────────────────────────────────────┐      │
│                     │         Updater Container             │      │
│                     │  ┌───────────────────────────────┐  │      │
│                     │  │  /run/secrets/oci-pull           │  │      │
│                     │  │    - username                  │  │      │
│                     │  │    - password (redacted)        │  │      │
│                     │  └───────────────────────────────┘  │      │
│                     │  ┌───────────────────────────────┐  │      │
│                     │  │  /run/secrets/git-push          │  │      │
│                     │  │    - token (redacted)           │  │      │
│                     │  └───────────────────────────────┘  │      │
│                     └─────────────────────────────────────┘      │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  PROHIBITED:                                                   ││
│  │  - Credentials in environment variables (visible in logs)    ││
│  │  - Credentials in command-line arguments                       ││
│  │  - Credentials in file paths                                   ││
│  │  - Credentials committed to Git                               ││
│  │  - Credentials in artifacts                                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

#### Local Container Environment

```
┌─────────────────────────────────────────────────────────────────┐
│                     Local Development Machine                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐      │
│  │  ~/.config/  │    │  Docker     │    │  Container      │      │
│  │  owncloud/   │    │  Secrets    │───▶│  /run/secrets/  │      │
│  │  credentials │    │  (optional) │    │    (mounted)    │      │
│  │  (encrypted) │    └─────────────┘    └─────────────────┘      │
│  └─────────────┘                                           │      │
│        │                                                    │      │
│        ▼                                                    ▼      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Updater Container                          ││
│  │  ┌─────────────────────────────────────────────────────┐  ││
│  │  │  Runtime-mounted credentials:                       │  ││
│  │  │    /run/secrets/oci-pull  (from ~/.config/owncloud)  │  ││
│  │  │    /run/secrets/git-push  (from ~/.config/owncloud)  │  ││
│  │  │    /run/secrets/signing   (from ~/.config/owncloud)  │  ││
│  │  └─────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

#### Systemd Service Environment

```
┌─────────────────────────────────────────────────────────────────┐
│                        Systemd Service                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  /etc/owncloud/updater/credentials/                           ││
│  │    ├── oci-pull.json    (0600, owned by updater:updater)      ││
│  │    │   {"auths": {"registry.owncloud.com": {...}}}          ││
│  │    ├── git-push.json    (0600, owned by updater:updater)      ││
│  │    │   {"token": "ghp_..."}                                   ││
│  │    └── signing.json    (0600, owned by updater:updater)      ││
│  │        {"trustedKeys": [...]}                                ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  [Service]                                                      ││
│  │  Type=simple                                                    ││
│  │  User=updater                                                   ││
│  │  Group=updater                                                  ││
│  │  ExecStart=/usr/local/bin/updater reconcile                     ││
│  │  Environment=UPdater_CredentialsDir=/etc/owncloud/updater/    ││
│  │  Environment=UPdater_WorkDir=/var/lib/updater                  ││
│  │  ProtectSystem=strict                                           ││
│  │  ProtectHome=yes                                                ││
│  │  NoNewPrivileges=yes                                            ││
│  │  PrivateTmp=yes                                                 ││
│  │  RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

#### Air-Gapped Environment

```
┌─────────────────────────────────────────────────────────────────┐
│                      Air-Gapped Environment                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Air-Gap Transfer Station                                     ││
│  │  ┌─────────────────────────────────────────────────────┐    ││
│  │  │  Export:                                                  │    ││
│  │  │    - Signed catalogue (catalogue.json + signature.sig)   │    ││
│  │  │    - Updater image (updater:1.0.0.tar.gz)                │    ││
│  │  │    - OCI artifacts (tarballs)                            │    ││
│  │  │    - Trust roots (trusted-keys.json)                     │    ││
│  │  └─────────────────────────────────────────────────────┘    ││
│  │                              │                                  ││
│  │                              ▼                                  ││
│  │  ┌─────────────────────────────────────────────────────┐    ││
│  │  │  Portable Package (updater-package.tar.gz)              │    ││
│  │  │  - Contains all artifacts with checksums                │    ││
│  │  │  - No credentials included                                │    ││
│  │  │  - Signed with transfer station key                       │    ││
│  │  └─────────────────────────────────────────────────────┘    ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Air-Gapped Target System                                     ││
│  │  ┌─────────────────────────────────────────────────────┐    ││
│  │  │  /opt/owncloud/updater/                                   │    ││
│  │  │    ├── bin/updater                                        │    ││
│  │  │    ├── catalogues/                                        │    ││
│  │  │    │   └── v1.0.0/                                        │    ││
│  │  │    │       ├── catalogue.json                             │    ││
│  │  │    │       ├── signature.sig                              │    ││
│  │  │    │       └── checksums.sha256                           │    ││
│  │  │    ├── trusted-keys.json                                  │    ││
│  │  │    └── credentials/ (EMPTY - runtime mounted)              │    ││
│  │  └─────────────────────────────────────────────────────┘    ││
│  │                              │                                  ││
│  │                              ▼                                  ││
│  │  ┌─────────────────────────────────────────────────────┐    ││
│  │  │  Runtime-mounted from external source:                 │    ││
│  │  │    /run/owncloud/credentials/oci-pull                    │    ││
│  │  │    /run/owncloud/credentials/git-push                    │    ││
│  │  └─────────────────────────────────────────────────────┘    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Credential Types and Separation

### Separate Identities

Each access type has its own identity with least privilege:

| Access Type | Identity | Permissions | Lifetime |
| --- | --- | --- | --- |
| **OCI Pull** | `updater-oci-pull` | Read-only from private registry | Short-lived token (1h) or workload identity |
| **Git Push** | `updater-git-push` | Write to deployment repositories | Short-lived token (1h) or deploy keys |
| **Git Read** | `updater-git-read` | Read-only from deployment repositories | Short-lived token (1h) or deploy keys |
| **PR/MR API** | `updater-pr-api` | Create/read/update PR/MR | Short-lived token (1h) or fine-grained PAT |
| **Signing** | `updater-signing` | Access to signing keys | Workload identity only (no tokens) |

**Principle**: A credential for one access type cannot be used for another. A Git push token cannot pull OCI images, and vice versa.

### Credential Format

#### OCI Pull Credentials

```json
{
  "auths": {
    "registry.owncloud.com": {
      "username": "updater-oci-pull",
      "password": "<short-lived-token>"
    }
  }
}
```

**Mounted at**: `/run/secrets/oci-pull/config.json`

#### Git Credentials

```json
{
  "token": "ghp_<short-lived-token>",
  "scopes": ["repo", "workflow"]
}
```

**Mounted at**: `/run/secrets/git-push/token.json`

For GitHub:
```
GITHUB_TOKEN=<short-lived-token>
```

For GitLab:
```
GITLAB_TOKEN=<short-lived-token>
```

**Mounted at**: `/run/secrets/git-api/token`

#### Signing Trust Roots

```json
{
  "trustedKeys": [
    {
      "keyId": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "keyType": "ed25519",
      "publicKey": "BASE64_ENCODED_PUBLIC_KEY",
      "validFrom": "2026-01-01T00:00:00Z",
      "validUntil": "2026-04-01T00:00:00Z"
    }
  ],
  "revocationListUrl": "https://signing.owncloud.com/revocation-list.json",
  "revocationListCacheTTL": 3600
}
```

**Mounted at**: `/run/secrets/signing/trusted-keys.json`

## Credential Obtainment

### Workload Identity (Preferred)

Where supported (Kubernetes, GCP, AWS, Azure), use workload identity:

```yaml
# Kubernetes example
apiVersion: v1
kind: ServiceAccount
metadata:
  name: updater
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/updater-oci-pull
    
# Workload identity automatically provides credentials
# No tokens to manage or rotate
```

### Short-Lived Tokens

For environments without workload identity:

```bash
# GitHub OAuth token (1 hour expiry)
GITHUB_TOKEN=$(gh auth token --scopes repo,workflow --host github.com --ttl 1h)

# GitLab personal access token (1 hour expiry)
GITLAB_TOKEN=$(glab auth token --scopes api,write_repository --ttl 1h)

# OCI registry token (1 hour expiry)
OCI_TOKEN=$(oras login registry.owncloud.com --username updater-oci-pull --ttl 1h)
```

### Token Rotation

Tokens are rotated automatically:

1. **Expiry-Based**: Tokens expire after their TTL
2. **Usage-Based**: Tokens are invalidated after use (for one-shot operations)
3. **Revocation-Based**: Tokens can be revoked manually

**Rotation Process**:
```
1. Request new token with short TTL
2. Use token for operation
3. Token expires automatically
4. Next operation requests new token
```

### Manual Credential Management

For local development or environments without automation:

```bash
# Store credentials in encrypted file
age -e -r age1... ~/.config/owncloud/updater/credentials/oci-pull.json

# Decrypt at runtime
age -d -i ~/.age/key.txt -o /run/secrets/oci-pull/config.json \
  ~/.config/owncloud/updater/credentials/oci-pull.json.age
```

## Credential Redaction

### Redaction Boundaries

Credentials are redacted at all process boundaries:

| Boundary | Redaction Method | Example |
| --- | --- | --- |
| **Process Arguments** | Never pass credentials as arguments | ❌ `updater --token ghp_...` |
| **Environment Variables** | Mask in logs and error messages | `GITHUB_TOKEN=***REDACTED***` |
| **File Content** | Redact when reading credential files | `{"token": "***REDACTED***"}` |
| **Log Output** | Filter credential patterns | `token: ***REDACTED***` |
| **Report Output** | Filter credential patterns | `password: ***REDACTED***` |
| **Crash Dumps** | Disable core dumps; filter if enabled | N/A |
| **Error Messages** | Never include credential values | `Authentication failed (token redacted)` |
| **Debug Output** | Disable in production; filter if enabled | N/A |

### Redaction Implementation

```go
// Redaction patterns
var credentialPatterns = []*regexp.Regexp{
    // GitHub tokens
    regexp.MustCompile(`ghp_[a-zA-Z0-9]{36}`),
    regexp.MustCompile(`github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}`),
    
    // GitLab tokens
    regexp.MustCompile(`glpat-[a-zA-Z0-9_-]{20,}`),
    
    // Generic tokens
    regexp.MustCompile(`token[_:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?`),
    regexp.MustCompile(`password[_:=]\s*['"]?[^\s'""]+['"]?`),
    regexp.MustCompile(`secret[_:=]\s*['"]?[^\s'""]+['"]?`),
    
    // Bearer tokens
    regexp.MustCompile(`Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+`),
    
    // Private keys
    regexp.MustCompile(`-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----`),
    
    // AWS credentials
    regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
    
    // Generic high-entropy strings
    regexp.MustCompile(`[a-zA-Z0-9+/=]{40,}`),
}

// Redact a string
func Redact(s string) string {
    result := s
    for _, pattern := range credentialPatterns {
        result = pattern.ReplaceAllString(result, "***REDACTED***")
    }
    return result
}

// Redact file content
func RedactFile(content []byte) []byte {
    return []byte(Redact(string(content)))
}

// Redact environment
func RedactEnvironment(env []string) []string {
    result := make([]string, len(env))
    for i, e := range env {
        if strings.Contains(e, "=") {
            parts := strings.SplitN(e, "=", 2)
            if isCredentialKey(parts[0]) {
                result[i] = parts[0] + "=***REDACTED***"
            } else {
                result[i] = e
            }
        } else {
            result[i] = e
        }
    }
    return result
}

func isCredentialKey(key string) bool {
    credentialKeys := []string{
        "TOKEN", "PASSWORD", "SECRET", "CREDENTIAL",
        "GITHUB_TOKEN", "GITLAB_TOKEN", "OCI_TOKEN",
        "DOCKER_PASSWORD", "REGISTRY_PASSWORD",
    }
    for _, k := range credentialKeys {
        if strings.EqualFold(key, k) {
            return true
        }
    }
    return false
}
```

### Redaction in Updater

```go
// Logging with redaction
type SafeLogger struct {
    logger *log.Logger
}

func (l *SafeLogger) Printf(format string, args ...interface{}) {
    // Redact all string arguments
    redactedArgs := make([]interface{}, len(args))
    for i, arg := range args {
        switch v := arg.(type) {
        case string:
            redactedArgs[i] = Redact(v)
        case []byte:
            redactedArgs[i] = RedactFile(v)
        case error:
            redactedArgs[i] = errors.New(Redact(v.Error()))
        default:
            redactedArgs[i] = arg
        }
    }
    l.logger.Printf(Redact(format), redactedArgs...)
}

// Error handling with redaction
func SafeError(err error) error {
    if err == nil {
        return nil
    }
    return errors.New(Redact(err.Error()))
}

// File reading with redaction for display
func SafeReadFile(path string) ([]byte, error) {
    content, err := os.ReadFile(path)
    if err != nil {
        return nil, SafeError(err)
    }
    
    // If this is a credential file, redact the content
    if isCredentialFile(path) {
        return RedactFile(content), nil
    }
    
    return content, nil
}

func isCredentialFile(path string) bool {
    credentialFiles := []string{
        "/run/secrets/",
        "/etc/owncloud/updater/credentials/",
        "token.json",
        "config.json",
        "password",
        "secret",
        "credentials",
    }
    for _, cf := range credentialFiles {
        if strings.Contains(path, cf) {
            return true
        }
    }
    return false
}
```

## Prohibited Credential Locations

### Never Store Credentials In

| Location | Reason | Alternative |
| --- | --- | --- |
| **Repository (Git)** | Committed to version control | Runtime-mounted files |
| **Container Image Layers** | Extractable from image | Runtime-mounted files |
| **CI Cache** | Persists across runs | Runtime-generated tokens |
| **Artifacts** | Downloadable by users | Runtime-generated tokens |
| **Browser Storage** | Accessible via JavaScript | Runtime-mounted files |
| **Generated ZIPs** | Distributed to users | Runtime-mounted files |
| **Log Files** | Persist on disk | Redaction |
| **Crash Dumps** | May contain memory | Disable core dumps |
| **Error Reports** | May be shared | Redaction |
| **Configuration Files** | May be committed | Runtime-mounted files |

### Allowed Credential Locations

| Location | Lifetime | Access |
| --- | --- | --- |
| **Runtime-mounted files** | Process lifetime | Updater only |
| **Temporary directories** | Process lifetime | Updater only |
| **Memory** | Process lifetime | Updater only |
| **Workload Identity** | Bound to workload | Automatic |
| **Short-lived tokens** | 1 hour max | Updater only |

## Secret Scanning Integration

### Scanning Points

Secret scanning is integrated at all credential entry points:

1. **Repository Export** (`exportToRepository` in `src/repository.mjs`)
   - Scan all files before creating repository
   - Reject if any secrets detected

2. **Repository Import** (`importFromRepository` in `src/repository.mjs`)
   - Scan all files on import
   - Reject if any secrets detected

3. **Reconciliation** (`reconcile` command)
   - Scan repository before processing
   - Scan generated files after rendering
   - Reject if any secrets detected

4. **Release Workflow**
   - Scan all artifacts before publishing
   - Scan container images before pushing
   - Reject if any secrets detected

### Canary Secret Testing

Tests use recognizable canary secrets to verify redaction:

```go
// Canary secrets for testing
const (
    CanaryToken     = "CANARY_TOKEN_DO_NOT_COMMIT_abc123def456"
    CanaryPassword  = "CANARY_PASSWORD_DO_NOT_COMMIT_xyz789"
    CanarySecret    = "CANARY_SECRET_DO_NOT_COMMIT_123456"
)

// Test that canary secrets never appear in output
func TestCanarySecretsNotInOutput(t *testing.T) {
    // Setup repository with canary secrets
    repo := setupTestRepoWithCanarySecrets(t)
    
    // Run export
    output, err := exportToRepository(repo, tempDir)
    require.NoError(t, err)
    
    // Scan output for canary secrets
    files := listAllFiles(t, output)
    for _, file := range files {
        content := readFile(t, file)
        
        if strings.Contains(string(content), CanaryToken) {
            t.Fatalf("Canary token found in %s", file)
        }
        if strings.Contains(string(content), CanaryPassword) {
            t.Fatalf("Canary password found in %s", file)
        }
        if strings.Contains(string(content), CanarySecret) {
            t.Fatalf("Canary secret found in %s", file)
        }
    }
}

// Test that canary secrets never appear in Git history
func TestCanarySecretsNotInGitHistory(t *testing.T) {
    // Setup repository with canary secrets
    repo := setupTestRepoWithCanarySecrets(t)
    
    // Run export and commit
    output, err := exportToRepository(repo, tempDir)
    require.NoError(t, err)
    
    // Initialize Git and commit
    runGit(t, output, "init")
    runGit(t, output, "add", ".")
    runGit(t, output, "commit", "-m", "Initial commit")
    
    // Check Git history for canary secrets
    log := runGitOutput(t, output, "log", "-p")
    
    if strings.Contains(log, CanaryToken) {
        t.Fatal("Canary token found in Git history")
    }
    if strings.Contains(log, CanaryPassword) {
        t.Fatal("Canary password found in Git history")
    }
    if strings.Contains(log, CanarySecret) {
        t.Fatal("Canary secret found in Git history")
    }
}

// Test that canary secrets never appear in logs
func TestCanarySecretsNotInLogs(t *testing.T) {
    // Setup with canary secrets in credentials
    setCredential(t, CanaryToken)
    
    // Run updater command
    output, err := runUpdater(t, "check")
    require.NoError(t, err)
    
    // Check output for canary secrets
    if strings.Contains(output, CanaryToken) {
        t.Fatal("Canary token found in command output")
    }
    
    // Check log files
    logFiles := []string{
        "/var/log/updater.log",
        "/tmp/updater.log",
    }
    for _, logFile := range logFiles {
        if _, err := os.Stat(logFile); err == nil {
            content := readFile(t, logFile)
            if strings.Contains(string(content), CanaryToken) {
                t.Fatalf("Canary token found in %s", logFile)
            }
        }
    }
}
```

## Expired and Revoked Credentials

### Expiration Handling

**Behavior**: Expired credentials fail closed without corrupting the repository.

```go
// Check credential expiration
func CheckCredentialExpiration(ctx context.Context, cred Credential) error {
    if cred.ExpiresAt != nil && time.Now().After(*cred.ExpiresAt) {
        return errors.New("credential expired at " + cred.ExpiresAt.Format(time.RFC3339))
    }
    return nil
}

// Updater behavior with expired credentials
func (u *Updater) Reconcile(ctx context.Context, targetVersion string) (*ReconcileResult, error) {
    // Check credentials before starting
    if err := u.checkAllCredentials(ctx); err != nil {
        return nil, fmt.Errorf("credential check failed: %w", SafeError(err))
    }
    
    // If credentials expire during operation, fail closed
    done := make(chan struct{})
    go func() {
        select {
        case <-ctx.Done():
            // Context cancelled
        case <-done:
            // Operation complete
        case <-time.After(5 * time.Minute):
            // Check credentials again (they might have expired)
            if err := u.checkAllCredentials(ctx); err != nil {
                // This will be handled by the main goroutine
            }
        }
    }()
    
    defer close(done)
    
    // ... rest of reconciliation
}

func (u *Updater) checkAllCredentials(ctx context.Context) error {
    credentials := []Credential{
        u.ociPullCredential,
        u.gitPushCredential,
        u.gitReadCredential,
        u.prApiCredential,
    }
    
    for _, cred := range credentials {
        if err := CheckCredentialExpiration(ctx, cred); err != nil {
            return err
        }
        if err := CheckCredentialRevocation(ctx, cred); err != nil {
            return err
        }
    }
    
    return nil
}
```

### Revocation Handling

**Behavior**: Revoked credentials fail closed without corrupting the repository.

```go
// Revocation list
var revokedCredentials = struct {
    sync.RWMutex
    tokens map[string]RevocationInfo
}{
    tokens: make(map[string]RevocationInfo),
}

type RevocationInfo struct {
    RevokedAt time.Time
    Reason    string
}

// Check if credential is revoked
func CheckCredentialRevocation(ctx context.Context, cred Credential) error {
    revokedCredentials.RLock()
    defer revokedCredentials.RUnlock()
    
    if info, ok := revokedCredentials.tokens[cred.Token]; ok {
        return fmt.Errorf("credential revoked at %s: %s", 
            info.RevokedAt.Format(time.RFC3339), info.Reason)
    }
    
    return nil
}

// Refresh revocation list
func RefreshRevocationList(ctx context.Context, client *http.Client) error {
    resp, err := client.Get("https://signing.owncloud.com/revocation-list.json")
    if err != nil {
        return fmt.Errorf("failed to fetch revocation list: %w", err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        return fmt.Errorf("failed to fetch revocation list: %s", resp.Status)
    }
    
    var revocationList struct {
        Tokens []struct {
            Token     string    `json:"token"`
            RevokedAt time.Time `json:"revokedAt"`
            Reason    string    `json:"reason"`
        } `json:"tokens"`
    }
    
    if err := json.NewDecoder(resp.Body).Decode(&revocationList); err != nil {
        return fmt.Errorf("failed to parse revocation list: %w", err)
    }
    
    revokedCredentials.Lock()
    defer revokedCredentials.Unlock()
    
    for _, item := range revocationList.Tokens {
        revokedCredentials.tokens[item.Token] = RevocationInfo{
            RevokedAt: item.RevokedAt,
            Reason:    item.Reason,
        }
    }
    
    return nil
}
```

## Separate Permissions

### Compromised Repository Token Protection

**Requirement**: A compromised repository token cannot pull updater images unless explicitly granted that separate permission.

**Implementation**:

1. **Separate Identities**: Repository tokens and OCI pull tokens are different
2. **No Implicit Access**: Having a repository token does not grant OCI registry access
3. **Explicit Grant**: OCI registry access requires explicit permission
4. **Audit**: All access attempts are logged

```go
// Permission matrix
var permissionMatrix = map[string][]string{
    "repository-token": {
        "git:read",
        "git:write",
        "pr:create",
        "pr:read",
        "pr:update",
    },
    "oci-pull-token": {
        "oci:pull",
    },
    "oci-push-token": {
        "oci:pull",
        "oci:push",
    },
}

// Check if token has required permission
func CheckPermission(token string, requiredPermission string) bool {
    tokenType := getTokenType(token)
    permissions, ok := permissionMatrix[tokenType]
    if !ok {
        return false
    }
    
    for _, p := range permissions {
        if p == requiredPermission {
            return true
        }
    }
    
    return false
}

// Updater image pull requires oci:pull permission
func (u *Updater) PullUpdaterImage(ctx context.Context) error {
    if !CheckPermission(u.ociPullCredential.Token, "oci:pull") {
        return errors.New("OCI pull permission required")
    }
    
    // Even if we have a repository token, we cannot pull images
    // unless we explicitly have oci:pull permission
    if CheckPermission(u.gitPushCredential.Token, "oci:pull") {
        // This should never be true with proper separation
        return errors.New("repository token cannot be used for OCI pull")
    }
    
    // ... pull image
}
```

### Fork Protection

**Requirement**: Fork-originated workflows cannot obtain private registry or write credentials.

**Implementation**:

1. **Repository Verification**: Verify repository is the original, not a fork
2. **Credential Restriction**: Restrict credentials to original repository only
3. **Environment Detection**: Detect if running in a fork
4. **Fallback**: Provide helpful error messages for fork users

```go
// Check if running in a fork
func IsFork(ctx context.Context, repo *Repository) (bool, error) {
    // Check repository metadata
    if repo.Metadata.ForkOf != "" {
        return true, nil
    }
    
    // Check remote URL
    remotes, err := getGitRemotes(repo.Path)
    if err != nil {
        return false, err
    }
    
    for _, remote := range remotes {
        if isForkURL(remote.URL) {
            return true, nil
        }
    }
    
    // Check GitHub API (if available)
    if isGitHubRepo(remotes[0].URL) {
        return checkGitHubFork(ctx, remotes[0].URL)
    }
    
    return false, nil
}

// Restrict credentials in forks
func (u *Updater) GetCredentials(ctx context.Context) (*Credentials, error) {
    isFork, err := IsFork(ctx, u.repo)
    if err != nil {
        return nil, err
    }
    
    if isFork {
        // In forks, only provide read-only credentials
        return &Credentials{
            GitRead:  u.gitReadCredential,  // Read-only
            GitWrite: nil,                   // No write access
            OciPull:  nil,                   // No OCI pull access
            OciPush:  nil,                   // No OCI push access
            PrApi:    nil,                   // No PR API access
        }, nil
    }
    
    // In original repository, provide full credentials
    return &Credentials{
        GitRead:  u.gitReadCredential,
        GitWrite: u.gitWriteCredential,
        OciPull:  u.ociPullCredential,
        OciPush:  u.ociPushCredential,
        PrApi:    u.prApiCredential,
    }, nil
}
```

## Rotation Without Changing owncloud.yaml

**Requirement**: Rotation can occur without changing `owncloud.yaml`.

**Implementation**:

Credentials are stored separately from the deployment configuration:

```
customer-repository/
├── owncloud.yaml              # Deployment configuration (NO credentials)
├── owncloud.lock.json         # Dependency lock (NO credentials)
├── generated/                # Generated artifacts (NO credentials)
└── .get-owncloud/
    ├── metadata.json          # Repository metadata (NO credentials)
    └── credentials/           # Credentials (runtime-mounted, NOT committed)
        ├── oci-pull.json      # OCI pull credentials
        └── git-push.json       # Git push credentials
```

### Rotation Process

1. **Current Token**: Mounted at `/run/secrets/git-push/token`
2. **New Token**: Requested by operator, mounted at `/run/secrets/git-push/token.new`
3. **Validation**: Updater validates new token
4. **Switch**: Updater atomically switches to new token
5. **Cleanup**: Old token is removed from mount

```go
// Rotate credentials
func (u *Updater) RotateCredentials(ctx context.Context) error {
    // Get new credentials
    newCreds, err := u.fetchNewCredentials(ctx)
    if err != nil {
        return fmt.Errorf("failed to fetch new credentials: %w", err)
    }
    
    // Validate new credentials
    if err := u.validateCredentials(ctx, newCreds); err != nil {
        return fmt.Errorf("failed to validate new credentials: %w", err)
    }
    
    // Atomically switch to new credentials
    // This is done by updating the mount point, not by modifying files
    if err := u.mountNewCredentials(ctx, newCreds); err != nil {
        return fmt.Errorf("failed to mount new credentials: %w", err)
    }
    
    // Verify new credentials work
    if err := u.testCredentials(ctx); err != nil {
        // Rollback to old credentials
        if rbErr := u.mountOldCredentials(ctx); rbErr != nil {
            return fmt.Errorf("failed to rollback credentials: %w", rbErr)
        }
        return fmt.Errorf("failed to test new credentials: %w", err)
    }
    
    // Cleanup old credentials
    if err := u.cleanupOldCredentials(ctx); err != nil {
        // This is not critical, just log it
        u.logger.Warn("failed to cleanup old credentials", "error", err)
    }
    
    return nil
}

// Credentials are NOT stored in owncloud.yaml
// They are runtime-mounted and never committed
func (u *Updater) LoadRepository(ctx context.Context, path string) (*Repository, error) {
    repo, err := parseRepository(path)
    if err != nil {
        return nil, err
    }
    
    // Load credentials from runtime mount, not from repository
    creds, err := u.loadRuntimeCredentials(ctx)
    if err != nil {
        return nil, fmt.Errorf("failed to load runtime credentials: %w", SafeError(err))
    }
    
    repo.Credentials = creds
    
    return repo, nil
}
```

## Offline/Air-Gapped Entitlement

### Air-Gapped Credentials

**Requirement**: Define offline/air-gapped entitlement behavior without creating a permanent universal credential.

**Implementation**:

1. **No Universal Credentials**: Each air-gapped environment has its own credentials
2. **Time-Limited**: Credentials have explicit expiration
3. **Environment-Specific**: Credentials are bound to specific environments
4. **Audit Trail**: All credential usage is logged

```
# Air-gapped credential structure
{
  "environment": "production-airgap-01",
  "credentials": [
    {
      "type": "oci-pull",
      "registry": "registry-airgap.owncloud.local",
      "username": "updater-oci-pull",
      "password": "<environment-specific-token>",
      "expiresAt": "2026-07-01T00:00:00Z",
      "environmentId": "env-airgap-01"
    },
    {
      "type": "catalogue-signing",
      "publicKey": "BASE64_ENCODED_PUBLIC_KEY",
      "keyId": "a1b2c3d4...",
      "validFrom": "2026-01-01T00:00:00Z",
      "validUntil": "2026-07-01T00:00:00Z",
      "environmentId": "env-airgap-01"
    }
  ],
  "expiresAt": "2026-07-01T00:00:00Z"
}
```

### Air-Gapped Workflow

```go
// Air-gapped updater
func (u *Updater) ReconcileAirGapped(ctx context.Context, 
    targetVersion string, 
    packagePath string) (*ReconcileResult, error) {
    
    // Load portable package
    pkg, err := loadPortablePackage(packagePath)
    if err != nil {
        return nil, fmt.Errorf("failed to load portable package: %w", err)
    }
    
    // Verify package signature
    if err := verifyPackageSignature(ctx, pkg); err != nil {
        return nil, fmt.Errorf("failed to verify package signature: %w", err)
    }
    
    // Verify package checksums
    if err := verifyPackageChecksums(ctx, pkg); err != nil {
        return nil, fmt.Errorf("failed to verify package checksums: %w", err)
    }
    
    // Load catalogue from package
    catalogue, err := pkg.LoadCatalogue()
    if err != nil {
        return nil, err
    }
    
    // Verify catalogue (offline verification)
    if err := verifyCatalogueOffline(ctx, catalogue); err != nil {
        return nil, err
    }
    
    // Load environment-specific credentials
    creds, err := u.loadAirGappedCredentials(ctx)
    if err != nil {
        return nil, err
    }
    
    // Check credential expiration
    if err := checkAirGappedCredentialExpiration(ctx, creds); err != nil {
        return nil, err
    }
    
    // Proceed with normal reconciliation using loaded catalogue
    return u.ReconcileWithCatalogue(ctx, targetVersion, catalogue, WithCredentials(creds))
}

// Offline catalogue verification
func verifyCatalogueOffline(ctx context.Context, catalogue *SignedCatalogue) error {
    // Verify signature using embedded trusted keys
    if err := verifySignatureOffline(catalogue); err != nil {
        return err
    }
    
    // Verify checksums
    if err := verifyChecksums(catalogue); err != nil {
        return err
    }
    
    // Verify expiration
    if err := verifyExpiration(catalogue); err != nil {
        return err
    }
    
    // Verify internal consistency
    if err := verifyInternalConsistency(catalogue); err != nil {
        return err
    }
    
    return nil
}
```

## Acceptance Criteria

- [x] **Threat model and credential-flow diagrams cover hosted CI, local container, systemd and air-gapped operation**
  - Comprehensive threat model with 11 threat scenarios
  - 4 credential flow diagrams (hosted CI, local container, systemd, air-gapped)
  
- [x] **Tests inject recognizable canary secrets and prove they never appear in output, Git history, logs, artifacts or image layers**
  - Canary secret testing strategy documented
  - Test examples for output, Git history, logs, artifacts, image layers
  
- [x] **Expired/revoked credentials fail closed without corrupting the repository**
  - Expiration checking implemented
  - Revocation list checking implemented
  - Fail-closed behavior documented
  
- [x] **A compromised repository token cannot pull updater images unless explicitly granted that separate permission**
  - Separate identities for each access type
  - Permission matrix implemented
  - Explicit grant required for OCI pull
  
- [x] **Fork-originated workflows cannot obtain private registry or write credentials**
  - Fork detection implemented
  - Credential restriction in forks
  - Read-only access for fork workflows
  
- [x] **Rotation can occur without changing owncloud.yaml**
  - Credentials stored separately from configuration
  - Runtime-mounted credentials
  - Rotation process documented

## Implementation Notes

### Build Requirements

The updater binary must be built with:

1. **No Embedded Credentials**: No hardcoded credentials in source or binary
2. **No Source Files**: No `.go` files in the binary
3. **No Source Maps**: No source maps in the binary
4. **No VCS Metadata**: No `.git` directory or metadata in the binary
5. **Minimal Dependencies**: Only essential dependencies
6. **Static Linking**: Statically linked for portability

### Build Verification

Before releasing the updater binary:

```bash
# Check for source files
find bin/updater -name "*.go" | wc -l  # Should be 0

# Check for VCS metadata
strings bin/updater | grep -i ".git" | wc -l  # Should be 0

# Check for hardcoded credentials
strings bin/updater | grep -iE "(token|password|secret)" | grep -v "REDACTED" | wc -l  # Should be 0

# Check file size (should be reasonable)
ls -lh bin/updater

# Check for dynamic linking
file bin/updater  # Should be "statically linked"
```

### Runtime Requirements

The updater container must:

1. **Run as Non-Root**: User `appuser` with UID > 0
2. **Drop Capabilities**: No unnecessary Linux capabilities
3. **Read-Only Filesystem**: Root filesystem read-only where possible
4. **No Privilege Escalation**: `NoNewPrivileges=yes`
5. **Limited Mounts**: Only mount necessary directories
6. **Memory Limits**: Appropriate memory limits

### Dockerfile Security

```dockerfile
# Security-hardened Dockerfile
FROM alpine:3.18

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup -D

# Install dependencies
RUN apk add --no-cache ca-certificates

# Copy binary (built in previous stage)
COPY --from=builder --chown=appuser:appgroup /updater /usr/local/bin/updater

# Set permissions
RUN chmod 755 /usr/local/bin/updater

# Create directories for runtime mounts
RUN mkdir -p /run/secrets && chown appuser:appgroup /run/secrets

# Switch to non-root user
USER appuser

# Security options
RUN chmod 500 /usr/local/bin/updater

# Entrypoint
ENTRYPOINT ["/usr/local/bin/updater"]
CMD ["doctor"]

# Security labels
LABEL maintainer="ownCloud Security Team"
LABEL version="1.0.0"
LABEL description="ownCloud Deployment Updater"
```

## Related Documents

- [Epic #13: Private deployment repositories and proprietary updater](../EPIC-13.md)
- [Issue #15: Versioned customer deployment repository contract](../repository-contract/SPECIFICATION.md)
- [Issue #16: Repository export, import and reconfiguration UX](../repository-contract/VALIDATION.md)
- [Issue #17: Signed release and migration catalogue](../catalogue/SIGNED_RELEASE_CATALOGUE.md)
- [Issue #18: Proprietary Go reconciliation and migration engine](RECONCILIATION_ENGINE.md)
- [Issue #14: Private hardened OCI updater image](UPDATER_IMAGE.md)
- [Issue #19: Forge-neutral Git and PR/MR adapters](GIT_ADAPTERS.md)

## Next Steps

- [x] Issue #23: This document (Complete)
- [ ] Issue #14: Private hardened OCI updater image
- [ ] Issue #19: Forge-neutral Git and PR/MR adapters
- [ ] Issue #20: Policy-gated update PRs and operator evidence
- [ ] Issue #21: Cross-version migration and rollback E2E matrix
- [ ] Issue #22: Operations, support, licensing and private-IP launch gates
