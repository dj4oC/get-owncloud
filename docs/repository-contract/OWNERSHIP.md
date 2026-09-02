# Repository Ownership and Responsibility Matrix

**Parent Issue**: #15
**Epic**: #13

## Overview

This document defines ownership boundaries and responsibilities for files within a customer deployment repository. Clear ownership ensures that users understand what they can modify and what is managed by the system.

## Ownership Model

### Three-Tier Ownership

| Tier | Owner | Responsibility | Mutability |
| --- | --- | --- | --- |
| **User** | Customer/Operator | Deployment intent and customizations | Read-Write |
| **Shared** | Customer + System | Configuration that can be user-modified but system-validated | Read-Write (validated) |
| **System** | Deployment Hub | Generated artifacts, locks, and metadata | Read-Only (regenerate on change) |

### Ownership by Path

| Path | Owner | Mutable | Description | Validation |
| --- | --- | --- | --- | --- |
| `owncloud.yaml` | User | Yes | Primary deployment intent | Schema-validated |
| `overlays/*.yaml` | User | Yes | Kubernetes/Helm value overlays | Policy-validated |
| `overlays/*.yml` | User | Yes | Compose configuration overlays | Policy-validated |
| `overlays/*.env` | User | Yes | Environment variable overrides | Policy-validated |
| `overlays/*.json` | User | Yes | JSON configuration patches | Policy-validated |
| `owncloud.lock.json` | System | No | Exact dependency and version lock | Hash-validated |
| `generated/` | System | No | Deterministic deployment artifacts | Drift-detected |
| `generated/**/*` | System | No | All files under generated/ | Drift-detected |
| `.get-owncloud/` | System | No | Repository metadata and migrations | System-managed |
| `.get-owncloud/metadata.json` | System | No | Repository format and migration state | System-managed |
| `.get-owncloud/migrations/` | System | No | Applied migration records | System-managed |
| `.gitignore` | System | No | Git ignore patterns | System-managed |
| `README.md` | User | Yes | Repository-specific documentation | User-managed |
| `docs/` | User | Yes | User documentation | User-managed |
| `.github/` | User | Yes | GitHub-specific CI/CD (optional) | User-managed |
| `.gitlab-ci.yml` | User | Yes | GitLab CI/CD (optional) | User-managed |

## User Responsibilities

### What Users Own

1. **Deployment Intent** (`owncloud.yaml`)
   - Define purpose (evaluation/production)
   - Specify target runtime and manager
   - Configure workload parameters
   - Define identity configuration
   - Configure storage settings
   - Set office integration preferences
   - Configure networking and TLS
   - Enable/disable features

2. **Customizations** (`overlays/`)
   - Add custom configuration overlays
   - Define environment-specific settings
   - Add custom resource definitions
   - Configure custom monitoring/alerting

3. **Documentation** (`README.md`, `docs/`)
   - Document deployment-specific information
   - Add operational runbooks
   - Document custom configurations

### What Users Must NOT Do

1. **Do not modify generated files**
   - Any change to `generated/` will be detected and fail closed
   - Manual changes will be overwritten on regeneration

2. **Do not modify lock files**
   - `owncloud.lock.json` is system-managed
   - Changes may break reproducibility and update paths

3. **Do not commit secrets**
   - Never commit plaintext passwords, keys, or credentials
   - Use secret references only
   - See [Secret Boundaries](#secret-boundaries) below

4. **Do not bypass policy**
   - All overlays are validated against policy
   - Attempts to bypass policy will be rejected

## System Responsibilities

### What the System Owns

1. **Dependency Locking** (`owncloud.lock.json`)
   - Exact version pins for all components
   - Image digests and checksums
   - Catalogue version references
   - Policy hashes

2. **Generated Artifacts** (`generated/`)
   - Docker Compose files
   - Helm values and templates
   - Ansible inventory and playbooks
   - Kubernetes manifests
   - All renderer-specific outputs

3. **Repository Metadata** (`.get-owncloud/`)
   - Format version tracking
   - Migration history
   - Deployment identifiers
   - Timestamp records

4. **Git Management**
   - `.gitignore` patterns
   - Commit ordering (recommended)
   - Branch protection rules (recommended)

### What the System Guarantees

1. **Determinism**
   - Same input = same output (byte-identical)
   - Reproducible across environments
   - Consistent hashing

2. **Validation**
   - Schema validation on all control files
   - Policy enforcement
   - Drift detection
   - Secret scanning

3. **Update Safety**
   - Migration paths between versions
   - Rollback capabilities
   - Change impact analysis

## Secret Boundaries

### Allowed Secret Patterns

| Pattern | Example | Status |
| --- | --- | --- |
| Environment variable reference | `${ADMIN_PASSWORD}` | Allowed |
| Kubernetes secret reference | `secretKeyRef: name: admin-password, key: password` | Allowed |
| Ansible vault reference | `!vault \| encrypted_value` | Allowed |
| File reference (external) | `/run/secrets/admin-password` | Allowed |

### Forbidden Secret Patterns

| Pattern | Example | Status |
| --- | --- | --- |
| Plaintext password | `adminPassword: secret123` | **FORBIDDEN** |
| Base64-encoded secret | `adminPassword: c2VjcmV0MTIz` | **FORBIDDEN** |
| Hardcoded API key | `apiKey: abc123-xyz456` | **FORBIDDEN** |
| Private key in file | `-----BEGIN PRIVATE KEY-----` | **FORBIDDEN** |
| Registry credential | `docker-password: mypassword` | **FORBIDDEN** |
| Database connection string | `mysql://user:password@host/db` | **FORBIDDEN** |

### Secret Validation

The system performs the following secret validation:

1. **Pattern Matching**: Scans for known secret patterns (passwords, keys, tokens)
2. **Entropy Check**: Detects high-entropy strings that may be secrets
3. **Path Validation**: Ensures secrets are not in forbidden locations
4. **File Type Check**: Rejects known secret file types
5. **Reference Validation**: Verifies all secret references use approved patterns

## Drift Detection

### Detection Mechanism

1. **Hash-Based Detection**
   - Each generated file contains a hash of its input
   - The updater recalculates expected hashes
   - Mismatches are flagged as drift

2. **Content Validation**
   - Generated files are validated against their schemas
   - Lock file is validated against current catalogue
   - All references are resolved and validated

3. **Ownership Check**
   - Files marked as system-owned are checked for manual modifications
   - User-owned files are validated but not overwritten without approval

### Drift Response

| Drift Type | Response | User Action |
| --- | --- | --- |
| Generated file modified | Fail closed | Revert or regenerate |
| Lock file modified | Fail closed | Revert or update profile |
| Schema violation | Fail closed | Fix validation errors |
| Policy violation | Fail closed | Remove forbidden configuration |
| Secret detected | Fail closed | Replace with reference |
| Metadata corrupted | Fail closed | Contact support |

### Drift Remediation

1. **Automatic Remediation** (for non-breaking drift)
   - System can auto-regenerate files if drift is due to catalogue updates
   - Requires explicit user approval

2. **Manual Remediation** (for breaking drift)
   - User must review and approve changes
   - System provides clear migration path
   - Change impact is documented

## Policy Enforcement Points

### Pre-Commit Validation

1. **Schema Validation**
   - All YAML/JSON files validated against schemas
   - Unknown fields rejected
   - Type constraints enforced

2. **Policy Validation**
   - Storage mode restrictions (ocis/s3ng only)
   - Identity mode restrictions (embedded <= 20 users)
   - Office integration restrictions (Collabora only)
   - NFS version requirement (v4.2)
   - TLS requirements (HTTPS only)

3. **Secret Validation**
   - No plaintext secrets
   - All secrets use approved reference patterns
   - Secret files not committed

### Pre-Update Validation

1. **Compatibility Check**
   - Repository format version supported
   - Migration path available
   - All dependencies resolvable

2. **Impact Analysis**
   - Breaking changes identified
   - Configuration conflicts detected
   - Rollback path verified

3. **Safety Checks**
   - Backup verification
   - Health check validation
   - Resource requirement validation

## Migration Ownership

### Migration Process

1. **Initiation**
   - Updater detects new version available
   - Checks repository compatibility
   - Identifies required migrations

2. **Execution**
   - System applies migrations in order
   - Validates each migration step
   - Records migration in metadata

3. **Review**
   - System commits migration changes to branch
   - Opens PR/MR for user review
   - Provides change summary and impact analysis

4. **Approval**
   - User reviews changes
   - User tests in staging (recommended)
   - User approves and merges

### Migration Ownership by Step

| Step | Owner | Responsibility |
| --- | --- | --- |
| Detect available migrations | System | Scan for updates |
| Validate migration path | System | Check compatibility |
| Apply migration transformations | System | Modify files as needed |
| Validate migration result | System | Verify all checks pass |
| Record migration | System | Update metadata |
| Commit changes | System | Create Git commit |
| Open PR/MR | System | Create review request |
| Review changes | User | Validate migration |
| Approve changes | User | Authorize deployment |
| Merge changes | User | Complete migration |

## Conflict Resolution

### Ownership Conflicts

If a file is claimed by both user and system ownership:

1. **User wins for user-owned paths**
   - User changes in `owncloud.yaml` and `overlays/` are preserved
   - System regenerates dependent files

2. **System wins for system-owned paths**
   - System changes in `generated/` and `owncloud.lock.json` are authoritative
   - User changes are detected as drift

3. **Shared paths require coordination**
   - Changes are validated against policy
   - Conflicts are reported to user for resolution

### Conflict Detection

1. **Merge Conflicts**
   - Detected during PR/MR merge
   - User must resolve manually
   - System provides guidance

2. **Regeneration Conflicts**
   - Detected when profile changes but generated files don't match
   - System fails closed with diagnostics
   - User must regenerate or revert

3. **Migration Conflicts**
   - Detected during migration application
   - System attempts automatic resolution
   - Falls back to user resolution if automatic fails

## Audit Trail

### What is Recorded

1. **Repository Metadata** (`.get-owncloud/metadata.json`)
   - Creation timestamp
   - Last update timestamp
   - Configurator version
   - Applied migrations
   - Deployment ID

2. **Migration Records** (`.get-owncloud/migrations/*.json`)
   - Migration ID
   - Applied timestamp
   - From/to versions
   - Description
   - Changes made
   - Validation results

3. **Git History**
   - All changes committed with meaningful messages
   - Author information preserved
   - Timestamps accurate

### Audit Guarantees

1. **Immutability**
   - Committed history cannot be rewritten
   - All changes are traceable

2. **Completeness**
   - All configuration changes recorded
   - All migrations tracked
   - All updates logged

3. **Verifiability**
   - Every commit can be verified against its inputs
   - Every generation can be reproduced
   - Every migration can be audited

## Compliance

### Compliance Requirements

1. **Data Protection**
   - No plaintext secrets in repository
   - No personal data in configuration
   - All sensitive data encrypted or referenced

2. **Access Control**
   - Repository access controlled by user
   - System access least-privilege
   - All operations auditable

3. **Change Management**
   - All changes reviewable
   - All updates approved
   - All migrations tested

### Compliance Validation

The system validates compliance by:

1. **Automated Scanning**
   - Secret detection
   - Policy enforcement
   - Schema validation

2. **Manual Review**
   - PR/MR review process
   - Change impact analysis
   - Rollback verification

3. **Audit**
   - Regular compliance audits
   - Drift detection
   - Access review
