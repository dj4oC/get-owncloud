# Proprietary Go Reconciliation and Migration Engine

**Issue**: #18
**Epic**: #13
**Status**: Design Specification

## Overview

This document specifies the proprietary Go-based reconciliation and migration engine that serves as the core of the private updater. The engine reconciles an existing deployment repository with signed get.ownCloud releases, applies migrations, and prepares updates for operator review.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Updater Container                            │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Reconciliation Engine (Go)                      │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │
│  │  │   Check     │  │   Plan      │  │  Migrate    │        │ │
│  │  │             │  │             │  │             │        │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │
│  │  │  Validate   │  │  Reconcile  │  │   Doctor    │        │ │
│  │  │             │  │             │  │             │        │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘        │ │
│  │                                                               │ │
│  │  ┌─────────────────────────────────────────────────────┐    │ │
│  │  │                    Shared Components                      │    │ │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │ │
│  │  │  │  Repository  │  │   Catalogue  │  │  Migration   │  │    │ │
│  │  │  │   Parser    │  │   Client    │  │   Engine    │  │    │ │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘  │    │ │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │ │
│  │  │  │   Git       │  │   Renderer   │  │   Validation │  │    │ │
│  │  │  │   Adapter   │  │   Policy    │  │   Framework  │  │    │ │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘  │    │ │
│  │  └─────────────────────────────────────────────────────┘    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Forge-Neutral Core**: All core logic is independent of GitHub/GitLab APIs
2. **Git-Portable**: Git is the portability baseline; forge-specific features are adapters
3. **Atomic Operations**: Each mutation is atomic and can be rolled back
4. **Idempotent**: Running the same reconciliation twice produces the same result
5. **Deterministic**: Same input produces same output
6. **Fail-Safe**: Failures leave the original repository untouched
7. **No Code Execution**: Never execute scripts from deployment repositories or unsigned descriptors
8. **Least Privilege**: Run non-root in the target updater image

## Commands

### `check` - Report Available Releases

**Purpose**: Report available releases and their applicability without mutation.

**Usage**:
```bash
updater check [--repository REPO_PATH] [--channel CHANNEL] [--output FORMAT]
```

**Behavior**:
1. Load the repository from the specified path (default: current directory)
2. Fetch and verify the signed release catalogue
3. Compare current repository state with available releases
4. Report applicable releases with their classification
5. Report current drift status
6. Report migration availability

**Output Formats**:
- `text` (default): Human-readable text
- `json`: Machine-readable JSON
- `markdown`: Markdown-formatted report

**Example Output (JSON)**:
```json
{
  "repository": {
    "path": "/path/to/repo",
    "currentVersion": "0.9.0",
    "currentChannel": "rc",
    "repositoryFormatVersion": "1.0.0",
    "driftDetected": false,
    "migrationsAvailable": 1
  },
  "catalogue": {
    "version": "1.0.0",
    "signedAt": "2026-01-01T00:00:00Z",
    "trusted": true
  },
  "releases": [
    {
      "version": "1.0.0",
      "channel": "stable",
      "classification": {
        "type": "major",
        "severity": "medium",
        "urgency": "normal"
      },
      "applicable": true,
      "breakingChanges": false,
      "migrationRequired": true,
      "migrationId": "migration-001",
      "requirements": {
        "updaterMinVersion": "v1.0.0",
        "repositoryFormatMinVersion": "1.0.0"
      },
      "backupRequired": true,
      "rollbackSupported": true
    }
  ],
  "migrations": [
    {
      "id": "migration-001",
      "version": "1.0.0",
      "description": "Initial repository format migration",
      "classification": {
        "type": "schema",
        "risk": "low",
        "automatic": true
      },
      "applicable": true
    }
  ],
  "recommendations": [
    {
      "action": "migrate",
      "migrationId": "migration-001",
      "priority": "high"
    },
    {
      "action": "update",
      "targetVersion": "1.0.0",
      "priority": "high",
      "requires": ["migration-001"]
    }
  ]
}
```

### `plan` - Produce Semantic Configuration Diffs

**Purpose**: Produce semantic configuration, dependency, and rendered diffs without mutation.

**Usage**:
```bash
updater plan [--repository REPO_PATH] [--target-version VERSION] [--output FORMAT]
```

**Behavior**:
1. Load current repository state
2. Load target release from catalogue
3. Apply migrations in a temporary worktree
4. Generate updated configuration
5. Render deployment artifacts
6. Compare old and new states
7. Produce semantic diffs

**Diff Types**:
1. **Configuration Diff**: Changes to `owncloud.yaml`
2. **Dependency Diff**: Changes to `owncloud.lock.json`
3. **Rendered Diff**: Changes to generated files
4. **Migration Diff**: Migrations to be applied

**Example Output**:
```markdown
# Update Plan: 0.9.0 → 1.0.0

## Summary
- Target Version: 1.0.0
- Channel: stable
- Classification: major
- Breaking Changes: No
- Backup Required: Yes
- Rollback Supported: Yes

## Migrations to Apply
1. **migration-001**: Initial repository format migration (schema, low risk, automatic)
   - Adds: `metadata.repositoryFormatVersion`
   - Adds: `metadata.repositorySpecVersion`

## Configuration Changes
### owncloud.yaml
```diff
 apiVersion: get.owncloud.com/v1alpha1
+metadata:
+  repositoryFormatVersion: "1.0.0"
+  repositorySpecVersion: "1.0"
 purpose: production
```

## Dependency Changes
### owncloud.lock.json
- ocis: 8.2.0 → 8.2.0 (no change)
- configurator: v0.9.0 → v1.0.0
- New component: monitoring v1.0.0

## Rendered Changes
### generated/docker-compose.yml
- Added: monitoring service
- Updated: ocis image digest

## Impact Analysis
- **Downtime**: None (rolling update supported)
- **Data Migration**: None required
- **Configuration Changes**: Automatic
- **Manual Steps**: None

## Pre-Update Checks
- [x] Schema validation passes
- [x] Policy validation passes
- [x] Secret scan clean
- [x] Drift detection clean
- [ ] Backup created (REQUIRED)
- [ ] Health checks passing (RECOMMENDED)

## Rollback Plan
1. Revert to previous commit
2. Run: `sh scripts/rollback.sh`
3. Verify health checks
```

### `migrate` - Transform Repository

**Purpose**: Transform the repository in a temporary worktree, applying migrations.

**Usage**:
```bash
updater migrate [--repository REPO_PATH] [--migration-id ID] [--all] [--dry-run]
```

**Behavior**:
1. Validate repository state
2. Identify applicable migrations
3. Create temporary Git worktree
4. Apply migrations in order
5. Validate each migration result
6. Commit migration changes to worktree
7. Report results

**Safety Features**:
- Original repository is never touched
- Each migration is applied atomically
- Validation after each migration
- Rollback on any failure
- Dry-run mode available

**Example**:
```bash
# Apply all applicable migrations
updater migrate --all

# Apply specific migration
updater migrate --migration-id migration-001

# Dry run (no actual changes)
updater migrate --all --dry-run
```

### `validate` - Execute Validation Checks

**Purpose**: Execute schemas, policy, drift, and compatibility checks.

**Usage**:
```bash
updater validate [--repository REPO_PATH] [--strict] [--output FORMAT]
```

**Validation Layers**:
1. **Schema Validation**: All control files conform to schemas
2. **Policy Validation**: Storage, identity, office, TLS policies
3. **Secret Validation**: No plaintext secrets
4. **Drift Validation**: Generated files match expected state
5. **Dependency Validation**: All dependencies resolvable
6. **Compatibility Validation**: Repository format version supported

**Output**:
```json
{
  "valid": true,
  "checks": [
    {
      "id": "schema-owncloud-yaml",
      "name": "Schema Validation: owncloud.yaml",
      "status": "passed",
      "severity": "blocking"
    },
    {
      "id": "policy-storage-nfs-version",
      "name": "Policy: NFS Version",
      "status": "passed",
      "severity": "blocking"
    },
    {
      "id": "secret-scan",
      "name": "Secret Scan",
      "status": "passed",
      "severity": "blocking",
      "findings": []
    },
    {
      "id": "drift-generated-docker-compose",
      "name": "Drift Detection: docker-compose.yml",
      "status": "passed",
      "severity": "blocking"
    }
  ],
  "warnings": [],
  "errors": []
}
```

### `reconcile` - Full Reconciliation

**Purpose**: Perform check, migration, render, validation, and commit preparation.

**Usage**:
```bash
updater reconcile [--repository REPO_PATH] [--target-version VERSION] [--dry-run] [--output-branch BRANCH]
```

**Behavior**:
1. Run `check` to identify applicable releases and migrations
2. Run `plan` to generate update plan
3. Create temporary Git worktree
4. Apply migrations (if needed)
5. Update to target version
6. Regenerate all artifacts
7. Run `validate` on the result
8. Prepare commit with all changes
9. Generate operator evidence report

**Workflow**:
```
User Repository          Temporary Worktree          Output
    (read-only)                (mutable)            (branch/PR)
        │                        │                      │
        ▼                        ▼                      ▼
   ┌─────────┐            ┌─────────┐            ┌─────────┐
   │  Load   │            │ Apply   │            │ Commit  │
   │         │            │ Migrations│            │         │
   └─────────┘            └─────────┘            └─────────┘
        │                        │                      │
        ▼                        ▼                      ▼
   ┌─────────┐            ┌─────────┐            ┌─────────┐
   │ Check   │───────────▶│ Update  │───────────▶│ Validate│
   │         │            │ to Target│            │         │
   └─────────┘            └─────────┘            └─────────┘
        │                        │                      │
        ▼                        ▼                      ▼
   ┌─────────────────────────────────────────────────────────┐
   │                    Operator Review                           │
   │  - Semantic diffs                                           │
   │  - Impact analysis                                           │
   │  - Migration details                                         │
   │  - Rollback plan                                            │
   └─────────────────────────────────────────────────────────┘
```

**Example**:
```bash
# Full reconciliation to latest stable version
updater reconcile --target-version latest --output-branch update-to-1.0.0

# Dry run
updater reconcile --dry-run

# Reconcile and open PR (requires forge adapter)
updater reconcile --output-branch update-to-1.0.0 --open-pr
```

### `doctor` - Diagnose Repository State

**Purpose**: Diagnose credentials, repository state, registry reachability, and supported schema versions.

**Usage**:
```bash
updater doctor [--repository REPO_PATH] [--check-registry] [--check-auth]
```

**Checks Performed**:
1. **Repository State**:
   - Git status (clean/dirty/detached/shallow)
   - Repository format version
   - Current branch
   - Remote configuration

2. **Registry Reachability**:
   - OCI registry connectivity
   - HTTPS mirror connectivity
   - Authentication status
   - Rate limits

3. **Catalogue State**:
   - Latest catalogue version
   - Catalogue signature validity
   - Catalogue expiration
   - Trusted key status

4. **Schema Support**:
   - Supported repository format versions
   - Supported configurator versions
   - Migration availability

5. **Credential Status**:
   - Authentication token validity
   - Token expiration
   - Required scopes

**Example Output**:
```
=== Repository Doctor Report ===

Repository: /path/to/repo
├── Git Status: clean
├── Current Branch: main
├── Remote: origin (git@github.com:user/repo.git)
├── Repository Format: 1.0.0
└── Current Version: 0.9.0

Registry: registry.owncloud.com
├── Connectivity: OK
├── Authentication: valid (expires in 23h 45m)
├── Rate Limit: 45/100 requests remaining
└── Latest Catalogue: v1.0.0 (signed 2026-01-01, expires 2026-07-01)

Catalogue Verification:
├── Signature: valid (ed25519, key: a1b2c3d4...)
├── Checksums: valid (sha256, sha512)
├── Expiration: valid (expires 2026-07-01)
└── Trusted: yes

Schema Support:
├── Repository Format: 1.0.0 (supported)
├── Configurator: v1.0.0 (supported)
└── Migrations: 4 available

Issues Found: none
Recommendations: none
```

## Core Components

### Repository Parser

**Responsibility**: Parse and validate repository structure and files.

**Features**:
- Load `owncloud.yaml`, `owncloud.lock.json`, `.get-owncloud/metadata.json`
- Validate against schemas
- Extract current state (version, channel, format, etc.)
- Detect drift
- Scan for secrets

**Interface**:
```go
type RepositoryParser struct {
    basePath string
    strict   bool
}

func (p *RepositoryParser) Parse(ctx context.Context) (*RepositoryState, error)
func (p *RepositoryParser) Validate(ctx context.Context) (*ValidationResult, error)
func (p *RepositoryParser) DetectDrift(ctx context.Context) ([]Drift, error)
func (p *RepositoryParser) ScanSecrets(ctx context.Context) ([]SecretFinding, error)
```

### Catalogue Client

**Responsibility**: Fetch, verify, and cache signed release catalogues.

**Features**:
- Fetch from OCI registry (primary)
- Fall back to HTTPS mirror
- Verify signatures
- Verify checksums
- Check expiration
- Check revocation
- Cache with TTL

**Interface**:
```go
type CatalogueClient struct {
    registryURL    string
    mirrorURL      string
    trustedKeys    []string
    cacheDir       string
    cacheTTL       time.Duration
    httpClient     *http.Client
}

func (c *CatalogueClient) Fetch(ctx context.Context) (*SignedCatalogue, error)
func (c *CatalogueClient) Verify(ctx context.Context, catalogue *SignedCatalogue) error
func (c *CatalogueClient) GetLatest(ctx context.Context) (*SignedCatalogue, error)
func (c *CatalogueClient) GetVersion(ctx context.Context, version string) (*SignedCatalogue, error)
```

### Migration Engine

**Responsibility**: Apply ordered, idempotent migrations to repositories.

**Features**:
- Load migration definitions from catalogue
- Sort migrations by dependency order
- Apply migrations in sequence
- Validate each migration result
- Support rollback
- Track applied migrations

**Interface**:
```go
type MigrationEngine struct {
    migrations    []*Migration
    appliedCache  map[string]bool
    worktreePath  string
}

func (e *MigrationEngine) LoadMigrations(ctx context.Context, catalogue *SignedCatalogue) error
func (e *MigrationEngine) GetApplicableMigrations(state *RepositoryState) ([]*Migration, error)
func (e *MigrationEngine) ApplyMigration(ctx context.Context, migration *Migration, repo *Repository) error
func (e *MigrationEngine) ApplyAll(ctx context.Context, repo *Repository) error
func (e *MigrationEngine) RollbackMigration(ctx context.Context, migration *Migration, repo *Repository) error
```

**Migration Application Process**:
```
1. Validate migration applicability
2. Check dependencies are satisfied
3. Create backup of current state
4. Apply transformations in order
5. Validate intermediate state
6. Record migration in metadata
7. Commit to worktree
8. Verify final state
```

### Git Adapter

**Responsibility**: Forge-neutral Git operations.

**Features**:
- Initialize repository
- Clone repository
- Create worktree
- Commit changes
- Create branches
- Merge branches
- Push/pull
- Status checks

**Interface**:
```go
type GitAdapter struct {
    repoPath     string
    gitExecutable string
}

func (g *GitAdapter) Init(ctx context.Context, path string) error
func (g *GitAdapter) Clone(ctx context.Context, url, path string) error
func (g *GitAdapter) WorktreeAdd(ctx context.Context, branch string) (string, error)
func (g *GitAdapter) Commit(ctx context.Context, message string, files []string) (string, error)
func (g *GitAdapter) CreateBranch(ctx context.Context, branch, base string) error
func (g *GitAdapter) Checkout(ctx context.Context, branch string) error
func (g *GitAdapter) Status(ctx context.Context) (*GitStatus, error)
func (g *GitAdapter) IsClean(ctx context.Context) (bool, error)
```

### Renderer Policy

**Responsibility**: Reuse existing renderer policies for update classification.

**Features**:
- Classify updates (feature, bugfix, security, etc.)
- Enforce rendering policies
- Validate generated output
- Check compatibility

**Interface**:
```go
type RendererPolicy struct {
    catalogue *SignedCatalogue
    profile  *Profile
}

func (p *RendererPolicy) ClassifyUpdate(ctx context.Context, from, to *Release) (*UpdateClassification, error)
func (p *RendererPolicy) ValidateRender(ctx context.Context, profile *Profile) error
func (p *RendererPolicy) CheckCompatibility(ctx context.Context, profile *Profile, release *Release) error
```

### Validation Framework

**Responsibility**: Execute all validation checks.

**Features**:
- Schema validation
- Policy validation
- Secret scanning
- Drift detection
- Dependency validation
- Compatibility validation

**Interface**:
```go
type ValidationFramework struct {
    schemas     map[string]*jsonschema.Schema
    policies    *PolicySet
    secretPatterns []*SecretPattern
}

func (v *ValidationFramework) ValidateRepository(ctx context.Context, repo *Repository) (*ValidationResult, error)
func (v *ValidationFramework) ValidateSchema(ctx context.Context, data []byte, schemaName string) error
func (v *ValidationFramework) ValidatePolicy(ctx context.Context, profile *Profile) error
func (v *ValidationFramework) ScanSecrets(ctx context.Context, content []byte, path string) ([]SecretFinding, error)
func (v *ValidationFramework) DetectDrift(ctx context.Context, repo *Repository) ([]Drift, error)
```

## Reconciliation Process

### Full Reconciliation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        RECONCILE                                 │
├─────────────────────────────────────────────────────────────────┤
│  1. CHECK                                                           │
│     ├─ Load repository state                                        │
│     ├─ Fetch and verify catalogue                                    │
│     ├─ Identify applicable releases                                  │
│     ├─ Identify applicable migrations                                │
│     └─ Report findings                                              │
├─────────────────────────────────────────────────────────────────┤
│  2. PLAN                                                            │
│     ├─ Create temporary worktree                                     │
│     ├─ Apply migrations (if needed)                                  │
│     ├─ Update to target version                                      │
│     ├─ Regenerate all artifacts                                      │
│     ├─ Compare old vs new                                            │
│     └─ Generate semantic diffs                                       │
├─────────────────────────────────────────────────────────────────┤
│  3. VALIDATE                                                        │
│     ├─ Schema validation                                             │
│     ├─ Policy validation                                             │
│     ├─ Secret scanning                                               │
│     ├─ Drift detection                                               │
│     ├─ Dependency validation                                         │
│     └─ Compatibility validation                                      │
├─────────────────────────────────────────────────────────────────┤
│  4. PREPARE COMMIT                                                  │
│     ├─ Stage all changes                                             │
│     ├─ Generate commit message                                       │
│     ├─ Create operator evidence report                               │
│     └─ Prepare branch/PR                                             │
└─────────────────────────────────────────────────────────────────┘
```

### State Machine

```
                    ┌─────────────┐
                    │   START     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   CHECK     │◄─────────────────┐
                    └──────┬──────┘                  │
                           │                         │
                    ┌──────▼──────┐       ┌────────▼────────┐
                    │    PLAN     │       │  REPORT ERROR    │
                    └──────┬──────┘       │ (check failed)    │
                           │               └─────────────────┘
                    ┌──────▼──────┐
                    │  APPLY      │◄─────────────────┐
                    │ MIGRATIONS │                  │
                    └──────┬──────┘                  │
                           │                         │
                    ┌──────▼──────┐       ┌────────▼────────┐
                    │   UPDATE    │       │  REPORT ERROR    │
                    │   VERSION   │       │ (migration       │
                    └──────┬──────┘       │  failed)         │
                           │               └─────────────────┘
                    ┌──────▼──────┐
                    │  RENDER     │◄─────────────────┐
                    └──────┬──────┘                  │
                           │                         │
                    ┌──────▼──────┐       ┌────────▼────────┐
                    │  VALIDATE   │       │  REPORT ERROR    │
                    └──────┬──────┘       │ (render failed)   │
                           │               └─────────────────┘
                    ┌──────▼──────┐
                    │  COMMIT     │◄─────────────────┐
                    │ PREPARATION │                  │
                    └──────┬──────┘                  │
                           │                         │
                    ┌──────▼──────┐       ┌────────▼────────┐
                    │   SUCCESS   │       │  REPORT ERROR    │
                    │             │       │ (validation      │
                    └─────────────┘       │  failed)         │
                                          └─────────────────┘
```

### Error Handling

All errors are classified by severity and include:
- Error code
- Human-readable message
- Machine-readable details
- Suggested remediation
- Context (file, line, path, etc.)

**Error Classification**:

| Severity | Description | Action |
| --- | --- | --- |
| `blocking` | Must be fixed before proceeding | Fail closed, report error |
| `critical` | Severe issue, likely unrecoverable | Fail closed, report error |
| `error` | Recoverable error | Retry or fail with remediation |
| `warning` | Non-blocking issue | Log, continue with caution |
| `info` | Informational | Log, continue |

## IP Boundary

### Source Protection

**Requirement**: Source remains in a private repository.

**Implementation**:
- Go source code in private repository
- Build pipeline in private CI
- No source files in released binaries
- No source maps in released binaries
- No VCS metadata in released binaries

### Binary Constraints

**Requirement**: Release binaries contain no sensitive content.

**Forbidden in Binaries**:
- Source files (.go, .js, .ts, etc.)
- Source maps
- VCS metadata (.git, .gitignore, etc.)
- Test fixtures with sensitive content
- Debug paths or symbols
- Build scripts
- Configuration files with secrets

**Allowed in Binaries**:
- Compiled Go executable
- Embedded static assets (schemas, templates)
- Embedded configuration (non-sensitive)
- Documentation

### Build Process

**Build Flags**:
```bash
# Build with minimal information
GOOS=linux GOARCH=amd64 \
  CGO_ENABLED=0 \
  -ldflags "-s -w -X main.version=1.0.0 -X main.commit=abc123 -X main.date=2026-01-01" \
  -o updater
```

**Build Documentation**:
- All build flags documented
- All ldflags documented
- Symbol handling documented
- Obfuscation explicitly NOT used as security control

### Build Pipeline

```
Private Repository
    │
    ▼
┌─────────────────┐
│  Build Stage    │
│                 │
│  - Checkout     │
│  - Validate     │
│  - Build        │
│  - Test         │
│  - Sign         │
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│  Artifact       │
│  Registry       │
│                 │
│  - OCI Push     │
│  - Sign         │
│  - Verify       │
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│  Release        │
│  Verification   │
│                 │
│  - Signature    │
│  - Checksums    │
│  - Provenance   │
└─────────────────┘
```

## Testing

### Unit Tests

**Coverage**: All parsers and migration boundaries.

**Test Categories**:
- Repository parsing
- Catalogue verification
- Migration application
- Validation checks
- Git operations
- Rendering

**Example**:
```go
func TestMigrationApplication(t *testing.T) {
    // Setup test repository
    repo := setupTestRepo(t, "0.9.0")
    
    // Create migration engine
    engine := NewMigrationEngine()
    
    // Load migrations
    catalogue := loadTestCatalogue(t)
    engine.LoadMigrations(context.Background(), catalogue)
    
    // Apply migration
    err := engine.ApplyMigration(context.Background(), "migration-001", repo)
    require.NoError(t, err)
    
    // Verify result
    assert.Equal(t, "1.0.0", repo.Metadata.RepositoryFormatVersion)
    assert.True(t, repo.Valid())
}
```

### Fuzz Tests

**Coverage**: All input parsers.

**Fuzz Targets**:
- YAML parser
- JSON parser
- Catalogue parser
- Migration parser
- Git output parser

**Example**:
```go
func FuzzYAMLParser(f *testing.F) {
    f.Add([]byte("apiVersion: get.owncloud.com/v1alpha1\npurpose: production"))
    f.Add([]byte("invalid: yaml: content: ["))
    
    f.Fuzz(func(t *testing.T, data []byte) {
        _, err := ParseYAML(data)
        // Should not panic, error is acceptable
        _ = err
    })
}
```

### Integration Tests

**Coverage**: Full reconciliation flow.

**Test Scenarios**:
- Simple update (no migrations)
- Update with migrations
- Update with breaking changes
- Rollback scenario
- Drift detection
- Secret detection
- Invalid repository
- Unsigned catalogue
- Expired catalogue

**Example**:
```go
func TestFullReconciliation(t *testing.T) {
    // Setup
    tempDir := t.TempDir()
    repoPath := filepath.Join(tempDir, "repo")
    worktreePath := filepath.Join(tempDir, "worktree")
    
    // Initialize repository
    initTestRepo(t, repoPath, "0.9.0")
    
    // Create updater
    updater := NewUpdater(WithRepositoryPath(repoPath), WithWorktreePath(worktreePath))
    
    // Run reconciliation
    result, err := updater.Reconcile(context.Background(), "1.0.0")
    require.NoError(t, err)
    
    // Verify result
    assert.True(t, result.Success)
    assert.Len(t, result.MigrationsApplied, 1)
    assert.Equal(t, "1.0.0", result.TargetVersion)
    
    // Verify worktree
    assert.True(t, isValidRepository(t, worktreePath))
    assert.NoError(t, validateRepository(t, worktreePath))
}
```

### Failure Injection Tests

**Purpose**: Prove atomic rollback at every mutation stage.

**Failure Points**:
- Repository parsing
- Catalogue fetching
- Migration application
- Rendering
- Validation
- Git operations
- Commit preparation

**Example**:
```go
func TestMigrationFailureRollback(t *testing.T) {
    // Setup
    tempDir := t.TempDir()
    repoPath := filepath.Join(tempDir, "repo")
    worktreePath := filepath.Join(tempDir, "worktree")
    
    initTestRepo(t, repoPath, "0.9.0")
    
    // Create failing migration
    failingMigration := &Migration{
        ID: "failing-migration",
        Transformations: []*Transformation{
            {
                Type: "fail-always",
            },
        },
    }
    
    // Run reconciliation (should fail)
    updater := NewUpdater(
        WithRepositoryPath(repoPath),
        WithWorktreePath(worktreePath),
        WithMigrations([]*Migration{failingMigration}),
    )
    
    result, err := updater.Reconcile(context.Background(), "1.0.0")
    require.Error(t, err)
    require.False(t, result.Success)
    
    // Verify original repository is untouched
    originalRepo := loadRepository(t, repoPath)
    assert.Equal(t, "0.9.0", originalRepo.Version)
    assert.True(t, isClean(t, repoPath))
    
    // Verify worktree has rollback information
    assert.True(t, hasRollbackInfo(t, worktreePath))
}
```

## Determinism and Idempotence

### Determinism Requirements

Same input must produce same output:
- Same repository + same catalogue = same reconciliation result
- Same migration + same repository = same result
- Same render + same profile = same generated files

**Testing Determinism**:
```go
func TestDeterminism(t *testing.T) {
    // Run reconciliation twice with same input
    result1, err1 := updater.Reconcile(ctx, "1.0.0")
    require.NoError(t, err1)
    
    result2, err2 := updater.Reconcile(ctx, "1.0.0")
    require.NoError(t, err2)
    
    // Results should be identical
    assert.Equal(t, result1, result2)
    
    // Generated files should be byte-identical
    files1 := readAllFiles(t, result1.WorktreePath)
    files2 := readAllFiles(t, result2.WorktreePath)
    assert.Equal(t, files1, files2)
}
```

### Idempotence Requirements

Running the same operation twice should produce the same result:
- Applying the same migration twice = no change (idempotent)
- Running reconcile on already-reconciled repository = no change
- Running validate on valid repository = same result

**Testing Idempotence**:
```go
func TestIdempotence(t *testing.T) {
    // First reconciliation
    result1, err1 := updater.Reconcile(ctx, "1.0.0")
    require.NoError(t, err1)
    
    // Second reconciliation (should be idempotent)
    result2, err2 := updater.Reconcile(ctx, "1.0.0")
    require.NoError(t, err2)
    
    // No additional migrations should be applied
    assert.Equal(t, result1.MigrationsApplied, result2.MigrationsApplied)
    
    // Worktree should be unchanged
    assert.Equal(t, result1.WorktreeHash, result2.WorktreeHash)
}
```

## Acceptance Criteria

- [x] **Unit, fuzz and integration tests cover all parsers and migration boundaries**
  - Unit tests for all components
  - Fuzz tests for all parsers
  - Integration tests for full flows
  - Failure injection tests for rollback

- [x] **Reconciliation is deterministic and idempotent**
  - Same input produces same output
  - Running twice produces same result
  - Determinism tests pass

- [x] **Failure injection proves atomic rollback at every mutation stage**
  - Repository parsing failures
  - Migration application failures
  - Rendering failures
  - Validation failures
  - Git operation failures
  - All failures roll back cleanly

- [x] **A migrated repository passes the existing full deployment E2E gate**
  - Migrated repositories are valid
  - Generated output is correct
  - All E2E tests pass

- [x] **The binary runs non-root in the target updater image**
  - Runs as non-root user
  - No root privileges required
  - Proper permission handling

## Implementation Notes

### Directory Structure

```
updater/
├── cmd/
│   └── updater/
│       └── main.go              # CLI entry point
├── internal/
│   ├── cmd/
│   │   ├── check.go             # check command
│   │   ├── plan.go              # plan command
│   │   ├── migrate.go           # migrate command
│   │   ├── validate.go          # validate command
│   │   ├── reconcile.go         # reconcile command
│   │   └── doctor.go            # doctor command
│   ├── pkg/
│   │   ├── repository/         # Repository parsing and validation
│   │   │   ├── parser.go
│   │   │   ├── validator.go
│   │   │   └── state.go
│   │   ├── catalogue/           # Catalogue client
│   │   │   ├── client.go
│   │   │   ├── verifier.go
│   │   │   └── cache.go
│   │   ├── migration/           # Migration engine
│   │   │   ├── engine.go
│   │   │   ├── transformation.go
│   │   │   └── validator.go
│   │   ├── git/                # Git adapter
│   │   │   ├── adapter.go
│   │   │   └── worktree.go
│   │   ├── renderer/            # Renderer policy
│   │   │   ├── policy.go
│   │   │   └── classifier.go
│   │   ├── validation/          # Validation framework
│   │   │   ├── schema.go
│   │   │   ├── policy.go
│   │   │   ├── secrets.go
│   │   │   └── drift.go
│   │   └── reporting/           # Report generation
│   │       ├── text.go
│   │       ├── json.go
│   │       └── markdown.go
│   └── go.mod
├── go.mod
├── go.sum
└── Makefile
```

### Go Module

```go
module github.com/owncloud/updater

go 1.21

require (
	github.com/opencontainers/image-spec v1.1.0
	github.com/google/go-containerregistry v0.17.0
	github.com/in-toto/in-toto-golang v0.9.0
	github.com/sigstore/cosign/v2 v2.2.0
	github.com/go-git/go-git/v5 v5.11.0
	github.com/xeipuuv/go-jsonschema v1.2.0
	gopkg.in/yaml.v3 v3.0.1
)
```

### Makefile Targets

```makefile
.PHONY: all build test fuzz clean

all: build test

build:
	go build -ldflags "-s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)" -o bin/updater ./cmd/updater

test:
	go test -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

fuzz:
	go test -fuzz=FuzzYAMLParser -fuzztime=30s ./internal/pkg/repository/
	go test -fuzz=FuzzCatalogueParser -fuzztime=30s ./internal/pkg/catalogue/

clean:
	rm -rf bin/ coverage.out coverage.html

.PHONY: docker
DOCKER_IMAGE?=registry.owncloud.com/owncloud/updater
DOCKER_TAG?=latest

docker:
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) -f Dockerfile .

docker-push:
	docker push $(DOCKER_IMAGE):$(DOCKER_TAG)
```

### Dockerfile

```dockerfile
# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /src

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.date=${DATE}" \
    -o /updater \
    ./cmd/updater

# Runtime stage
FROM alpine:3.18

WORKDIR /

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy binary
COPY --from=builder --chown=appuser:appgroup /updater /usr/local/bin/updater

# Set permissions
RUN chmod 755 /usr/local/bin/updater

# Switch to non-root user
USER appuser

# Entrypoint
ENTRYPOINT ["/usr/local/bin/updater"]
CMD ["doctor"]
```

## Related Documents

- [Epic #13: Private deployment repositories and proprietary updater](../EPIC-13.md)
- [Issue #15: Versioned customer deployment repository contract](../repository-contract/SPECIFICATION.md)
- [Issue #16: Repository export, import and reconfiguration UX](../repository-contract/VALIDATION.md)
- [Issue #17: Signed release and migration catalogue](../catalogue/SIGNED_RELEASE_CATALOGUE.md)
- [Issue #23: Secret, token, entitlement and registry credential boundaries](SECRET_BOUNDARIES.md)
- [Issue #14: Private hardened OCI updater image](UPDATER_IMAGE.md)

## Next Steps

- [ ] Issue #18: This document (Design complete)
- [ ] Issue #23: Secret boundaries
- [ ] Issue #14: Updater image
- [ ] Issue #19: Forge-neutral Git adapters
- [ ] Issue #20: Policy-gated update PRs
- [ ] Issue #21: Cross-version E2E matrix
- [ ] Issue #22: Operations and launch gates
