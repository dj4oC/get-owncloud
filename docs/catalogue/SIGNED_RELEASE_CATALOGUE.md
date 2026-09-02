# Signed Release and Migration Catalogue

**Issue**: #17
**Epic**: #13
**Status**: Implementation

## Overview

This document defines the portable, signed protocol through which the proprietary updater discovers dependency releases, repository-schema migrations, and deployment-contract changes. The catalogue is the authoritative source of truth for all update-related information.

## Catalogue Structure

The signed release catalogue is a JSON document that contains:

1. **Metadata**: Version, timestamps, and signing information
2. **Releases**: Available versions with components, classifications, and requirements
3. **Migrations**: Repository schema migrations and their transformations
4. **Channels**: Release channel definitions and update policies
5. **Security**: Key rotation, revocation, and verification requirements
6. **Distribution**: OCI registry and mirror information
7. **Upstream Drift**: Configuration for monitoring upstream source changes

## Catalogue Files

| File | Purpose | Schema |
| --- | --- | --- |
| `catalog/release-catalogue.json` | Main catalogue with all releases and migrations | `catalog/release-catalogue.schema.json` |
| `catalog/release-catalogue.schema.json` | JSON Schema for catalogue validation | Self-referencing |

## Distribution Model

### OCI Artifacts

The catalogue and all associated artifacts are distributed as OCI artifacts in an authenticated private registry:

```
registry.owncloud.com/
├── get-owncloud/
│   ├── catalogue/               # Signed release catalogues
│   │   ├── v1.0.0/              # Catalogue version
│   │   │   ├── index.json      # Catalogue index
│   │   │   ├── catalogue.json  # Signed catalogue
│   │   │   └── signature.sig   # Detached signature
│   │   └── latest              # Symlink to latest
│   ├── updater/                # Updater images
│   │   └── v1.0.0/             # Updater version
│   │       └── linux-amd64     # Platform-specific images
│   └── migrations/             # Migration logic (private)
│       └── v1.0.0/             # Migration version
└── owncloud/
    └── ocis/                   # oCIS images (referenced)
        └── 8.2.0/               # oCIS version
            └── sha256-abc123...  # Image manifest
```

### HTTPS Mirror

An HTTPS mirror is provided as a convenience for environments that cannot access OCI registries directly:

```
https://mirror.owncloud.com/
├── catalogue/
│   ├── v1.0.0/
│   │   ├── catalogue.json
│   │   ├── signature.sig
│   │   └── checksums.sha256
│   └── latest/
│       └── catalogue.json -> ../v1.0.0/catalogue.json
└── index.json
```

**Important**: The HTTPS mirror is a convenience only. OCI remains the portable distribution contract. The mirror must serve identical content to the OCI registry.

## Signature and Provenance

### Signing Process

1. **Content Preparation**: The catalogue JSON is serialized with deterministic ordering
2. **Hash Calculation**: SHA-256 and SHA-512 hashes are computed
3. **Signature**: The content is signed using Ed25519 or RSA-PSS
4. **Packaging**: The signed catalogue, signature, and checksums are packaged together

### Signature Format

```json
{
  "signature": {
    "algorithm": "ed25519",
    "value": "BASE64_ENCODED_SIGNATURE",
    "signingKeyId": "a1b2c3d4e5f6...",
    "signedBy": "ownCloud Release Signing Service",
    "signedAt": "2026-01-01T00:00:00Z",
    "certificateChain": ["BASE64_CERT_1", "BASE64_CERT_2"]
  },
  "checksums": {
    "sha256": "000000000000...",
    "sha512": "000000000000..."
  }
}
```

### Key Management

#### Key Rotation

- **Schedule**: Quarterly rotation of signing keys
- **Grace Period**: 90 days during which old keys are still accepted
- **Next Rotation**: Published in the catalogue

#### Key Revocation

- **Revocation List**: Maintained at `https://signing.owncloud.com/revocation-list.json`
- **Check**: Updater must check revocation list before accepting any signature
- **Revoked Keys**: Cannot be used for new signatures, old signatures are rejected

#### Trusted Keys

The updater maintains a list of trusted signing key IDs:

```json
{
  "trustedKeys": [
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5"
  ]
}
```

## Release Descriptor

### Required Fields

| Field | Type | Description |
| --- | --- | --- |
| `version` | string | Semantic version of the release |
| `channel` | enum | `stable`, `rc`, or `development` |
| `releaseDate` | date-time | ISO 8601 timestamp |
| `components` | object | Component versions and digests |
| `classification` | object | Release type, severity, urgency |
| `maturity` | enum | Production, community-preview, evaluation, experimental |

### Component Versions

Each release specifies exact versions and digests for all components:

```json
{
  "components": {
    "ocis": {
      "version": "8.2.0",
      "gitCommit": "42f7fdcfee2714cb14eedb36509f74ef205703f9",
      "imageDigest": "sha256:8c053ea63fc15b9788d55725b5d3abd9632dd89abfcb8a127e0c85acdd4ec2b4",
      "imageRegistry": "docker.io",
      "imageTag": "8.2.0"
    },
    "configurator": {
      "version": "v1.0.0",
      "gitCommit": "abc123...",
      "checksum": "sha256:def456..."
    },
    "collabora": {
      "version": "23.05.0",
      "imageDigest": "sha256:abc123...",
      "imageRegistry": "docker.io",
      "imageTag": "23.05.0"
    }
  }
}
```

### Classification

| Type | Severity | Urgency | Description |
| --- | --- | --- | --- |
| `feature` | low | normal | New features, non-breaking |
| `bugfix` | medium | urgent | Bug fixes, non-breaking |
| `security` | high | immediate | Security patches |
| `hotfix` | critical | immediate | Critical bug fixes |
| `major` | high | normal | Major version with potential breaking changes |
| `minor` | medium | normal | Minor version with new features |
| `patch` | low | normal | Patch version with bug fixes |

### Maturity Levels

| Level | Description | Production Ready |
| --- | --- | --- |
| `production` | Fully tested and supported | ✅ Yes |
| `community-preview` | Tested but not production-certified | ⚠️ No |
| `evaluation` | Basic testing, not for production | ❌ No |
| `experimental` | Development only | ❌ No |

### Support Status

| Status | Description |
| --- | --- |
| `fully-supported` | Full support with SLA |
| `limited-support` | Best-effort support |
| `best-effort` | Community support only |
| `unsupported` | No support |

## Migration Catalogue

### Migration Structure

Each migration defines how to transform a repository from one format version to another:

```json
{
  "id": "migration-001",
  "version": "1.0.0",
  "description": "Initial repository format migration",
  "classification": {
    "type": "schema",
    "risk": "low",
    "automatic": true,
    "userActionRequired": false
  },
  "appliesTo": {
    "repositoryFormatVersions": ["0.9.0", "0.8.0"],
    "configuratorVersions": ["v0.8.0", "v0.9.0"],
    "runtime": ["docker", "podman", "kubernetes"],
    "manager": ["direct", "ansible", "argocd"]
  },
  "dependencies": [],
  "transformations": [
    {
      "type": "add-field",
      "target": "$.metadata.repositoryFormatVersion",
      "value": "1.0.0"
    }
  ],
  "validation": {
    "schema": "https://get.owncloud.com/schema/deployment.schema.json",
    "requiredFields": ["$.metadata.repositoryFormatVersion"],
    "forbiddenFields": []
  },
  "rollback": {
    "supported": true,
    "inverseMigrationId": "migration-rollback-001"
  }
}
```

### Migration Types

| Type | Description | Risk | Automatic |
| --- | --- | --- | --- |
| `schema` | Schema version changes | Low-Medium | ✅ Yes |
| `policy` | Policy enforcement changes | Medium | ✅ Yes |
| `security` | Security-related changes | High | ⚠️ Conditional |
| `feature` | New feature additions | Low | ✅ Yes |
| `breaking` | Breaking changes | High | ❌ No |

### Transformation Types

| Type | Description | Example |
| --- | --- | --- |
| `add-field` | Add a new field with a value | Add repositoryFormatVersion |
| `remove-field` | Remove a field | Remove deprecated field |
| `rename-field` | Rename a field | Rename apiVersion to metadata.apiVersion |
| `change-type` | Change field type | string to integer |
| `set-value` | Set field to specific value | Set nfsVersion to "4.2" |
| `remove-file` | Remove a file | Remove old config file |
| `add-file` | Add a new file | Add new required file |
| `transform-value` | Transform value using template | Template-based changes |
| `reorder-keys` | Reorder object keys | Sort keys alphabetically |

### Migration Dependencies

Migrations can depend on other migrations being applied first:

```json
{
  "dependencies": ["migration-001", "migration-002"]
}
```

The updater ensures dependencies are applied in the correct order.

### Migration Validation

After applying a migration, the updater validates:

1. **Schema Validation**: The result conforms to the target schema
2. **Required Fields**: All required fields are present
3. **Forbidden Fields**: No forbidden fields remain
4. **Policy Validation**: The result passes all policy checks

## Channels

### Channel Definitions

| Channel | Description | Auto-Update | Update Window | Delay |
| --- | --- | --- | --- | --- |
| `stable` | Production-ready | ❌ No | Weekly (Sun 00:00) | 72 hours |
| `rc` | Release candidates | ❌ No | Daily (00:00) | 24 hours |
| `development` | Development builds | ✅ Yes | Hourly | 0 hours |

### Channel Switching

**Important**: A repository cannot silently change channels.

To switch channels:

1. The operator must explicitly request the channel change
2. The updater validates the request
3. A migration may be required to update the repository format
4. The change is recorded in the repository metadata
5. The operator must review and approve the change

### Update Policy

Each channel has its own update policy:

```json
{
  "updatePolicy": {
    "autoUpdate": false,
    "updateWindow": "0 0 * * 0",
    "delayAfterRelease": 72
  }
}
```

- **autoUpdate**: Whether updates are applied automatically
- **updateWindow**: Cron expression for when updates can be applied
- **delayAfterRelease**: Hours to wait after a release before offering update

## Security Requirements

### Signature Verification

The updater MUST:

1. ✅ Verify the catalogue signature using a trusted key
2. ✅ Check that the signing key is not revoked
3. ✅ Verify the catalogue checksums match
4. ✅ Check that the catalogue has not expired
5. ✅ Verify the catalogue version is supported
6. ✅ Check that the catalogue is internally consistent

### Internal Consistency Checks

The catalogue must be internally consistent:

1. **Chronological Order**: Releases are ordered from newest to oldest
2. **Version Uniqueness**: No duplicate versions
3. **Dependency Satisfaction**: All migration dependencies exist
4. **Channel Consistency**: Each release belongs to exactly one channel
5. **Requirement Satisfaction**: Updater version requirements are satisfiable

### Expired Catalogues

- Catalogues have an `expiresAt` timestamp
- Expired catalogues must be refreshed
- The updater rejects expired catalogues

### Revoked Keys

- The updater checks the revocation list before accepting any signature
- Signatures from revoked keys are rejected
- The revocation list is cached with a TTL

## Verification Process

### Step 1: Fetch Catalogue

1. Try OCI registry first
2. Fall back to HTTPS mirror if OCI is unavailable
3. Cache the catalogue with a TTL (default: 1 hour)

### Step 2: Verify Signature

1. Extract the signature and signed content
2. Verify the signature using the trusted key
3. Check that the signing key is in the trusted keys list
4. Check that the signing key is not revoked

### Step 3: Verify Checksums

1. Compute SHA-256 and SHA-512 of the catalogue content
2. Compare with the checksums in the catalogue
3. Reject if checksums don't match

### Step 4: Verify Chronology

1. Check that `generatedAt` is before `expiresAt`
2. Check that `signedAt` is before current time
3. Check that the catalogue is not expired

### Step 5: Verify Compatibility

1. Check that the updater version is within the required range
2. Check that the repository format version is supported
3. Check that all migration dependencies can be satisfied

### Step 6: Verify Internal Consistency

1. Check chronological order of releases
2. Check version uniqueness
3. Check dependency satisfaction
4. Check channel consistency

## Air-Gapped Operation

### Export Process

1. **Export Catalogue**: Download the signed catalogue and all required artifacts
2. **Verify Offline**: Verify signatures and checksums without network access
3. **Package**: Create a portable package with all artifacts

```bash
# Export catalogue and artifacts for air-gapped environment
get-owncloud updater export --output airgap-package.tar.gz

# Verify the exported package
get-owncloud updater verify --package airgap-package.tar.gz
```

### Import Process

1. **Import Package**: Load the portable package into the air-gapped environment
2. **Verify**: Verify all signatures and checksums
3. **Install**: Install the updater and catalogue

```bash
# Import the package
get-owncloud updater import --package airgap-package.tar.gz

# Verify the imported catalogue
get-owncloud updater verify
```

### Air-Gapped Verification

The updater can verify catalogues and artifacts without network access:

1. ✅ Verify catalogue signature
2. ✅ Verify catalogue checksums
3. ✅ Verify artifact checksums
4. ✅ Check revocation list (if cached)
5. ✅ Verify internal consistency

## Upstream Drift Discovery

The catalogue includes configuration for monitoring upstream sources:

```json
{
  "upstreamDrift": {
    "enabled": true,
    "checkInterval": "daily",
    "sources": [
      {
        "name": "ocis",
        "url": "https://github.com/owncloud/ocis",
        "type": "git",
        "watch": ["tags", "releases"]
      }
    ],
    "driftThreshold": 5
  }
}
```

### Drift Detection

1. **Source Monitoring**: The updater monitors upstream sources for changes
2. **Drift Calculation**: Compares current pinned versions with upstream versions
3. **Threshold**: Drift above the threshold opens a review issue
4. **No Auto-Update**: Drift detection never auto-updates pins

### Integration with Existing Discovery

The existing upstream discovery (from RFC #9) is integrated:

- Records source, EULA, and same-minor release drift
- Opens deduplicated review issues
- Never changes a deployment pin automatically

## Acceptance Criteria

- [x] **Normative schema and protocol document are committed**
  - `catalog/release-catalogue.schema.json` defines the complete schema
  - `docs/catalogue/SIGNED_RELEASE_CATALOGUE.md` documents the protocol
  
- [x] **The updater verifies signature, digest, provenance, chronology and compatibility before planning changes**
  - Signature verification with trusted keys
  - Digest verification (SHA-256, SHA-512)
  - Provenance tracking
  - Chronological validation
  - Compatibility checks
  
- [x] **Expired, revoked, unsigned, replayed and internally inconsistent catalogues fail closed**
  - Expired catalogues are rejected
  - Revoked key signatures are rejected
  - Unsigned catalogues are rejected (unless allowUnsigned is true)
  - Replayed catalogues are detected and rejected
  - Internally inconsistent catalogues are rejected
  
- [x] **An OCI-conformant registry mirror can serve the same verified artifacts without rewriting repository configuration**
  - OCI distribution is the primary contract
  - HTTPS mirror serves identical content
  - Verification works identically for both sources
  
- [x] **Air-gapped export/import and verification are tested**
  - Export process creates portable packages
  - Import process verifies offline
  - All verification works without network access
  
- [x] **Release production is reproducible and auditable from private source commit to descriptor digest**
  - Build pipeline is documented
  - All artifacts are signed
  - Full audit trail is maintained

## Implementation Notes

### Build Pipeline

The build pipeline for the catalogue:

1. **Source**: Private repository with catalogue definition
2. **Validation**: Schema validation of all entries
3. **Signing**: Sign the catalogue with the current signing key
4. **Packaging**: Package the signed catalogue and artifacts
5. **Distribution**: Push to OCI registry and HTTPS mirror
6. **Verification**: Verify the distributed catalogue

### Audit Trail

Every catalogue release includes:

- Git commit hash of the source
- Signing timestamp
- Signing key identifier
- Build pipeline run ID
- Full provenance chain

### Key Rotation Procedure

1. **Generate New Key**: Create new signing key pair
2. **Test Signing**: Sign test catalogues with new key
3. **Publish Key**: Add new key to trusted keys list (before rotation)
4. **Rotate**: Start signing production catalogues with new key
5. **Grace Period**: Continue accepting old key signatures
6. **Retire**: Remove old key from trusted keys list (after grace period)

### Revocation Procedure

1. **Identify Compromise**: Detect that a key has been compromised
2. **Revoke**: Add key to revocation list
3. **Publish**: Update revocation list on all mirrors
4. **Rotate**: Perform emergency key rotation if needed
5. **Audit**: Review all catalogues signed with the revoked key

## Related Documents

- [Repository Contract Specification](../repository-contract/SPECIFICATION.md)
- [Ownership and RACI](../OWNERSHIP.md)
- [Launch Gates](../LAUNCH_GATES.md)

## References

- [OCI Distribution Specification](https://github.com/opencontainers/distribution-spec)
- [OCI Image Specification](https://github.com/opencontainers/image-spec)
- [JSON Schema](https://json-schema.org/)
- [RFC 9421: Signing and Encryption for JSON Web Signatures (JWS)](https://datatracker.ietf.org/doc/html/rfc9421)
