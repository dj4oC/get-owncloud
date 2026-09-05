# Forge-Neutral Git and PR/MR Adapters

**Issue**: #19
**Epic**: #13

## Overview
Provider-neutral adapters allowing the updater to propose reviewed changes without binding to one repository vendor.

## Adapter Interface

```go
type GitAdapter interface {
    Clone(ctx context.Context, repoURL, localPath string, opts CloneOptions) error
    DiscoverRemote(ctx context.Context, localPath string) (*RemoteInfo, error)
    CreateBranch(ctx context.Context, localPath, branchName, baseBranch string) error
    PushBranch(ctx context.Context, localPath, branchName string, opts PushOptions) error
    DeleteBranch(ctx context.Context, localPath, branchName string) error
    GetHeadCommit(ctx context.Context, localPath string) (*CommitInfo, error)
    CreatePR(ctx context.Context, repoURL, branchName, baseBranch, title, desc string, opts PROptions) (*PRInfo, error)
    GetPRStatus(ctx context.Context, prInfo *PRInfo) (*PRStatus, error)
    GetProvider() ProviderType
}

type ProviderType string
const (
    ProviderGitHub  ProviderType = "github"
    ProviderGitLab  ProviderType = "gitlab"
    ProviderForgejo ProviderType = "forgejo"
    ProviderGitea   ProviderType = "gitea"
    ProviderGit     ProviderType = "git"
)
```

## Provider Adapters

### GitHub Adapter
- Uses github.com/google/go-github/v63
- Token authentication
- Rate limiting: 5000 requests/hour
- Supports all PR operations

### GitLab Adapter  
- Uses github.com/xanzy/go-gitlab
- Token authentication
- Rate limiting: 600 requests/minute
- Supports all MR operations

### Forgejo Adapter
- Uses code.gitea.io/sdk/gitea
- Token authentication + custom base URL
- Rate limiting: 100 requests/minute
- Similar API to Gitea

### Gitea Adapter
- Uses code.gitea.io/sdk/gitea
- Token authentication + custom base URL
- Rate limiting: 100 requests/minute

### Plain Git Adapter (Fallback)
- Uses system git command
- SSH or HTTPS authentication
- No PR API - pushes branch and emits Markdown review report
- Works with any Git server

## Adapter Factory

```go
type AdapterFactory struct {
    adapters map[ProviderType]GitAdapter
}

func (f *AdapterFactory) GetAdapterWithAuth(repoURL, token string) (GitAdapter, error) {
    provider := DetectProvider(repoURL)
    switch provider {
    case ProviderGitHub: return NewGitHubAdapter(token), nil
    case ProviderGitLab: return NewGitLabAdapter(token), nil
    case ProviderForgejo, ProviderGitea:
        baseURL := extractBaseURL(repoURL)
        return NewForgejoAdapter(token, baseURL), nil
    case ProviderGit: return NewGitAdapter(), nil
    default: return nil, fmt.Errorf("unknown provider: %s", provider)
    }
}

func DetectProvider(repoURL string) ProviderType {
    if strings.Contains(repoURL, "github.com") { return ProviderGitHub }
    if strings.Contains(repoURL, "gitlab.com") { return ProviderGitLab }
    if strings.Contains(repoURL, "forgejo.") { return ProviderForgejo }
    if strings.Contains(repoURL, "gitea.") { return ProviderGitea }
    return ProviderGit
}
```

## CI Runner Wrappers

### GitHub Actions
```yaml
- name: Run updater
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: ./updater reconcile --provider github
```

### GitLab CI
```yaml
script:
  - ./updater reconcile --provider gitlab
```

### Forgejo Actions
Similar to GitHub Actions

### Local/Systemd
- Systemd service with security hardening
- Timer for scheduled runs
- Config file at /etc/owncloud/updater/config.json

## Configuration

### Provider-Neutral Config
```yaml
# .get-owncloud/automation.yaml (NOT in owncloud.yaml)
automation:
  provider: github
  repository: https://github.com/customer/deployment.git
  target_version: latest
  output_branch: update-to-latest
  pr_options:
    labels: ["update", "automated"]
    reviewers: ["team-lead"]
    draft: false
```

## Detection and Safety

### Force-Push Detection
Compares local HEAD with remote HEAD to detect non-fast-forward pushes.

### Base Revision Verification
Verifies the base branch hasn't changed since the last reconciliation.

### Duplicate Branch Detection
Checks if an update branch already exists before creating a new one.

### Concurrent Run Detection
Uses lock files in `.get-owncloud/locks/` to prevent concurrent runs.

## Permission Matrices

### GitHub
- **Scopes**: `repo` (minimum)
- **Permissions**: Read repository, write repository, create PR, read/write PR

### GitLab
- **Scopes**: `read_repository`, `write_repository`, `api`
- **Permissions**: Read repo, write repo, create MR, read/write MR

### Forgejo/Gitea
- **Access**: Repository write access
- **Permissions**: Read repo, write repo, create PR, read/write PR

### Plain Git
- **Authentication**: SSH keys or HTTPS username/password
- **Permissions**: Clone, fetch, push

## Branch Protection
- **Never auto-merge**: Updater never merges its own PRs
- **Never auto-approve**: Updater never approves its own PRs
- **Respect protection**: Branch protection rules are checked

## Repository Access Control
- Each adapter configured with specific repository URL
- No wildcard access
- Repository access controller enforces restrictions
- Audit logging for all access

## Rate Limits and Idempotence

### Rate Limiting
```go
type RateLimiter struct {
    limit, remaining int
    resetAt time.Time
    mu sync.Mutex
}
func (r *RateLimiter) Wait(ctx context.Context) error { /* waits if rate limited */ }
```

### Idempotent PR Creation
- Check if PR already exists for branch
- Update existing PR if needed
- Prevent duplicate PRs

### Duplicate Event Handling
- Track processed pushes, PRs, comments
- 24-hour window for duplicate detection
- Prevents duplicate webhook processing

## Acceptance Criteria

- [x] Same fixture tested against each supported forge
- [x] Adapter contract tests for branch names, commit metadata, report content
- [x] Plain Git works with SSH/HTTPS bare remote
- [x] Least-privilege permission matrices documented
- [x] Rate limits, transient errors, duplicate execution are idempotent
- [x] No adapter can access repository other than configured target

## Related
- Epic: #13
- Next: #20 (policy-gated update PRs)

Closes #19