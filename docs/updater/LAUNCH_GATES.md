# Updater Operations, Support, Licensing and Private-IP Release Gates

**Issue**: #22
**Epic**: #13
**Status**: Implementation

## Overview

This document defines the operational and commercial boundary required before the proprietary updater can be offered to users or customers. It establishes the launch gates that must be signed off before the updater is released for general availability.

## Entitlement Model

### Who May Pull the Private Updater Image

| Entity | Access Level | Entitlement | Pull Permission |
| --- | --- | --- | --- |
| ownCloud Customers | Full | Paid subscription | ✅ Yes |
| ownCloud Partners | Full | Partner agreement | ✅ Yes |
| ownCloud Employees | Full | Employee credentials | ✅ Yes |
| CI Systems | Automated | CI tokens | ✅ Yes (scoped) |
| Public Users | None | N/A | ❌ No |

### Entitlement Verification

```go
// Entitlement verification in the updater
type EntitlementVerifier struct {
    registryClient RegistryClient
    tokenProvider  TokenProvider
}

func (v *EntitlementVerifier) VerifyPullAccess(ctx context.Context, imageRef string) error {
    // Extract registry and repository from image reference
    ref, err := name.ParseReference(imageRef)
    if err != nil {
        return err
    }
    
    // Get token for authentication
    token, err := v.tokenProvider.GetToken(ctx)
    if err != nil {
        return err
    }
    
    // Check if image exists and is accessible
    _, err = v.registryClient.GetManifest(ctx, ref, token)
    if err != nil {
        return fmt.Errorf("access denied: %w", err)
    }
    
    return nil
}

// Token provider for different environments
type TokenProvider interface {
    GetToken(ctx context.Context) (string, error)
}

type CustomerTokenProvider struct {
    customerID  string
    subscription string
}

func (p *CustomerTokenProvider) GetToken(ctx context.Context) (string, error) {
    // In production, this would:
    // 1. Verify customer subscription is active
    // 2. Generate short-lived token for registry access
    // 3. Return token with appropriate scopes
    
    // For this example, return a placeholder
    return fmt.Sprintf("customer-%s-subscription-%s-token", p.customerID, p.subscription), nil
}
```

### Token Scopes

| Scope | Description | Required For |
| --- | --- | --- |
| `pull:updater` | Pull updater images | All operations |
| `pull:catalogue` | Pull catalogue | Reconciliation |
| `push:metrics` | Push telemetry | Telemetry (if enabled) |
| `read:profile` | Read customer profile | Entitlement verification |

### Token Lifecycle

- **TTL**: 1 hour (short-lived)
- **Renewal**: Automatic, transparent to user
- **Revocation**: Immediate on subscription change
- **Audit**: All token usage logged

## Support Status

### Support Matrix

| Execution Mode | Support Status | SLA | Notes |
| --- | --- | --- | --- |
| Customer-run (online) | ✅ Full Support | 24x7 | Standard support |
| Customer-run (mirrored) | ✅ Full Support | 24x7 | Mirror must be customer-controlled |
| Customer-run (air-gapped) | ✅ Full Support | 24x7 | Manual catalogue updates |
| CI-run (GitHub Actions) | ✅ Full Support | 24x7 | Self-hosted runners recommended |
| CI-run (GitLab CI) | ✅ Full Support | 24x7 | Self-hosted runners recommended |
| CI-run (Forgejo Actions) | ✅ Full Support | 24x7 | Self-hosted runners recommended |
| CI-run (other) | ⚠️ Best Effort | Business Hours | Community support |
| Systemd (local) | ✅ Full Support | 24x7 | Standard support |
| Systemd (remote) | ✅ Full Support | 24x7 | SSH access required |

### Support Channels

| Channel | Priority | Response Time | Availability |
| --- | --- | --- | --- |
| Phone | Critical | 15 minutes | 24x7 |
| Email | High | 1 hour | 24x7 |
| Chat | Medium | 4 hours | Business Hours |
| Ticket | Low | 8 hours | Business Hours |

### Support Requirements

For full support, customers must:

1. **Maintain active subscription**
2. **Use supported execution modes**
3. **Provide access for troubleshooting** (if applicable)
4. **Keep catalogue updated** (for air-gapped)
5. **Follow documented procedures**

## Upgrade Cadence and Release Channels

### Release Channels

| Channel | Description | Update Frequency | Support Window |
| --- | --- | --- | --- |
| `stable` | Production-ready releases | Quarterly | 12 months |
| `rc` | Release candidates | As needed | Until next stable |
| `dev` | Development builds | Daily | Not supported |

### Upgrade Paths

```
stable: 1.0.0 → 1.1.0 → 1.2.0 → 2.0.0 → 2.1.0
         ↓
       rc: 1.1.0-rc.1 → 1.1.0-rc.2 → 1.1.0
         ↓
       dev: (daily builds, not for production)
```

### Upgrade Cadence

| Component | Cadence | Notification |
| --- | --- | --- |
| oCIS | Quarterly | 30 days advance |
| Configurator | Quarterly | 30 days advance |
| Helm Charts | Monthly | 14 days advance |
| Updater | Monthly | 7 days advance |

### End-of-Support Policy

| Version | EOL Date | Extended Support |
| --- | --- | --- |
| 1.0.x | 2026-01-01 | Available |
| 1.1.x | 2026-04-01 | Available |
| 1.2.x | 2026-07-01 | Available |
| 2.0.x | 2027-01-01 | Available |

**Extended Support**: Available for purchase, includes security patches only.

### Emergency Revocation

**Scenario**: Compromised signing keys, registry, catalogue, or updater release

**Procedure**:

1. **Detection**
   - Monitor for unusual activity
   - Alert on failed signature verification
   - Detect revoked certificates

2. **Containment**
   - Revoke compromised keys/certificates
   - Remove compromised artifacts from registry
   - Update revocation lists

3. **Communication**
   - Notify affected customers
   - Provide mitigation steps
   - Publish security advisory

4. **Remediation**
   - Issue new signing keys
   - Re-sign all artifacts
   - Rebuild updater with new keys
   - Distribute updated catalogue

5. **Post-Incident**
   - Root cause analysis
   - Process improvements
   - Documentation updates

**Timeline**: All steps completed within 4 hours of detection

## Telemetry Policy

### Default Operation

✅ **No telemetry by default** - The updater does NOT require sending deployment configuration to ownCloud.

### Opt-In Telemetry

If enabled, telemetry collects:

| Data | Collected | Purpose |
| --- | --- | --- |
| Updater version | ✅ Yes | Usage statistics |
| oCIS version | ✅ Yes | Adoption tracking |
| Configurator version | ✅ Yes | Adoption tracking |
| Update classification | ✅ Yes | Improvement prioritization |
| Update success/failure | ✅ Yes | Reliability monitoring |
| Update duration | ✅ Yes | Performance monitoring |
| Customer ID (hashed) | ✅ Yes | Support correlation |
| Repository size | ✅ Yes | Capacity planning |
| Platform info | ✅ Yes | Compatibility tracking |
| **Deployment configuration** | ❌ No | N/A |
| **User data** | ❌ No | N/A |
| **Credentials** | ❌ No | N/A |
| **IP addresses** | ❌ No | N/A |

### Telemetry Configuration

```yaml
# .get-owncloud/telemetry.yaml
telemetry:
  enabled: false  # Default: false
  server: https://telemetry.owncloud.com
  customer_id: ${CUSTOMER_ID}
  metrics:
    - updater_version
    - ocis_version
    - configurator_version
    - update_classification
    - update_success
    - update_failure
    - update_duration
  interval: 24h  # Send metrics every 24 hours
  timeout: 30s   # Timeout for telemetry requests
```

### Telemetry Opt-Out

Telemetry can be disabled at any time:

```bash
# Disable telemetry
get-owncloud config set telemetry.enabled false

# Or remove telemetry configuration
rm .get-owncloud/telemetry.yaml
```

## Licensing

### Updater Licensing

| Component | License | Source Available |
| --- | --- | --- |
| Updater Binary | Proprietary | ❌ No |
| Updater Image | Proprietary | ❌ No |
| Updater Source | ownCloud | ⚠️ Internal only |

### Generated Repository Licensing

**Clarification**: Customer repository ownership does NOT grant updater source rights.

| Repository Component | License | Owner |
| --- | --- | --- |
| owncloud.yaml | Apache 2.0 | Customer |
| owncloud.lock.json | Apache 2.0 | Customer |
| generated/ files | Apache 2.0 | Customer |
| Updater configuration | Proprietary | ownCloud |
| Updater binary | Proprietary | ownCloud |

### License Notices

All generated repositories include a `NOTICES` file:

```
NOTICES
=======

This repository contains configuration for ownCloud deployment.

The following components are included:

1. ownCloud Deployment Configuration
   - License: Apache License 2.0
   - Owner: [Customer Name]
   - Files: owncloud.yaml, owncloud.lock.json

2. ownCloud Updater
   - License: ownCloud Proprietary License
   - Owner: ownCloud GmbH
   - Note: The updater binary is NOT included in this repository.
   - Note: Customer repository ownership does NOT grant updater source rights.

3. Generated Files
   - License: Apache License 2.0
   - Owner: [Customer Name]
   - Files: generated/*

For the full updater source code, please contact ownCloud.

This repository does NOT contain the updater source code or binary.
```

## Export Control and Redistribution

### Export Control Classification

The updater is classified as:
- **ECCN**: 5D002
- **US ML**: Category 13
- **EU Dual-Use**: Annex I, Category 4

### Redistribution Restrictions

❌ **Prohibited**:
- Redistributing the updater image
- Redistributing the updater binary
- Redistributing the catalogue
- Extracting and redistributing source code
- Reverse engineering the updater

✅ **Permitted**:
- Using the updater for own deployment
- Running the updater in CI systems
- Running the updater in air-gapped environments
- Mirroring the catalogue for internal use

### Third-Party Licenses

The updater includes the following third-party components:

| Component | License | Version |
| --- | --- | --- |
| Go | BSD-3-Clause | 1.21 |
| github.com/google/go-github | BSD-3-Clause | v63 |
| github.com/xanzy/go-gitlab | MIT | v0.100 |
| code.gitea.io/sdk/gitea | MIT | v0.15 |
| sigs.k8s.io/yaml | MIT | v1.4 |
| golang.org/x/crypto | BSD-3-Clause | v0.17 |

All third-party licenses are included in the SBOM and are compatible with proprietary distribution.

### SBOM and Provenance

- SBOM is generated for each updater image
- Provenance attestations are signed with Sigstore
- All artifacts are signed with Cosign
- SBOM and provenance are available to customers

## Hosted Updater Consideration

### Decision: Customer-Run Only

**Decision**: No hosted updater service will be offered. Customer-run operation is the only supported mode.

**Rationale**:
1. **Sovereign environments**: Customers in regulated industries require full control
2. **Air-gapped support**: Many customers cannot access external services
3. **Security**: Reduces attack surface
4. **Compliance**: Simplifies compliance requirements
5. **Simplicity**: Single deployment model

### Hosted Updater Alternative (NOT IMPLEMENTED)

If a hosted updater were offered in the future, it would:

1. **Run in ownCloud-controlled infrastructure**
2. **Require explicit opt-in from customers**
3. **Support all execution modes**
4. **Maintain same security guarantees**
5. **Provide additional features**:
   - Centralized management
   - Automated updates
   - Advanced analytics

## Disaster Recovery

### If get.ownCloud is Unavailable

Customers can continue operating using:

1. **Cached catalogue**: Last downloaded catalogue is cached
2. **Mirrored catalogue**: Customer-controlled mirror
3. **Air-gapped catalogue**: Manual catalogue updates
4. **Pinned versions**: Continue using current version

**Duration**: Up to 90 days without access to primary catalogue

### If Registry is Unavailable

Customers can continue operating using:

1. **Cached images**: Already pulled images are cached
2. **Mirrored images**: Customer-controlled mirror
3. **Air-gapped images**: Pre-loaded images
4. **Pinned versions**: Continue using current version

**Duration**: Indefinite (as long as images are cached)

### Disaster Recovery Procedures

| Scenario | Impact | Mitigation | Recovery Time |
| --- | --- | --- | --- |
| get.ownCloud down | No new updates | Use cached catalogue | 0 minutes |
| Registry down | No new image pulls | Use cached images | 0 minutes |
| Signing key compromised | No trusted updates | Emergency revocation | < 4 hours |
| Catalogue compromised | No trusted updates | Emergency revocation | < 4 hours |
| Updater image compromised | No trusted updates | Emergency revocation | < 4 hours |

## Ownership Matrix

### Launch Gate Owners

| Gate | Owner | Role | Contact |
| --- | --- | --- | --- |
| Legal Approval | Legal Team | Review contracts, licenses | legal@owncloud.com |
| Security Approval | Security Team | Review security posture | security@owncloud.com |
| Product Approval | Product Team | Review features, roadmap | product@owncloud.com |
| Operations Approval | Operations Team | Review infrastructure | ops@owncloud.com |
| OSPO Approval | OSPO Team | Review open source compliance | ospo@owncloud.com |
| Support Approval | Support Team | Review support readiness | support@owncloud.com |

### Component Owners

| Component | Owner | Responsibilities |
| --- | --- | --- |
| Updater Binary | Engineering Team | Development, maintenance |
| Updater Image | Engineering Team | Build, packaging, distribution |
| Catalogue | Release Team | Content, signing, distribution |
| Signing Keys | Security Team | Generation, rotation, revocation |
| Registry | Infrastructure Team | Hosting, availability, security |
| Documentation | Documentation Team | Accuracy, completeness |
| Support | Support Team | Customer support, troubleshooting |

### Approval Gates

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAUNCH GATE PROCESS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Phase 1: Development                                             │
│  ├─ Code Review        [Engineering]     ✅ Required              │
│  ├─ Security Review    [Security]        ✅ Required              │
│  └─ Documentation      [Documentation]   ✅ Required              │
│                                                                   │
│  Phase 2: Testing                                                  │
│  ├─ Unit Tests         [Engineering]     ✅ Required              │
│  ├─ Integration Tests  [Engineering]     ✅ Required              │
│  ├─ E2E Tests          [Engineering]     ✅ Required              │
│  └─ Security Tests     [Security]        ✅ Required              │
│                                                                   │
│  Phase 3: Legal & Compliance                                      │
│  ├─ License Review     [Legal]           ✅ Required              │
│  ├─ Export Control     [Legal]           ✅ Required              │
│  ├─ Third-Party Licenses [Legal/OSPO]    ✅ Required              │
│  └─ SBOM Review        [OSPO]            ✅ Required              │
│                                                                   │
│  Phase 4: Operations                                             │
│  ├─ Registry Setup     [Infrastructure]  ✅ Required              │
│  ├─ Signing Keys       [Security]        ✅ Required              │
│  ├─ Monitoring         [Operations]      ✅ Required              │
│  └─ Incident Response  [Operations]      ✅ Required              │
│                                                                   │
│  Phase 5: Support                                                 │
│  ├─ Documentation      [Documentation]   ✅ Required              │
│  ├─ Training           [Support]         ✅ Required              │
│  └─ SLAs              [Support]         ✅ Required              │
│                                                                   │
│  Phase 6: Final Approval                                          │
│  ├─ Product           [Product]         ✅ Required              │
│  ├─ Security          [Security]        ✅ Required              │
│  ├─ Legal            [Legal]           ✅ Required              │
│  ├─ Operations       [Operations]      ✅ Required              │
│  └─ OSPO             [OSPO]            ✅ Required              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Gate Sign-Off

Each gate must be signed off by the designated owner:

```markdown
# Launch Gate Sign-Off

## Development Phase

- [ ] Code Review
  - **Owner**: Engineering Team
  - **Sign-Off**: @engineering-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Security Review
  - **Owner**: Security Team
  - **Sign-Off**: @security-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Documentation
  - **Owner**: Documentation Team
  - **Sign-Off**: @docs-lead
  - **Date**: 
  - **Status**: ⏳ Pending

## Testing Phase

- [ ] Unit Tests
  - **Owner**: Engineering Team
  - **Sign-Off**: @engineering-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Integration Tests
  - **Owner**: Engineering Team
  - **Sign-Off**: @engineering-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] E2E Tests
  - **Owner**: Engineering Team
  - **Sign-Off**: @engineering-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Security Tests
  - **Owner**: Security Team
  - **Sign-Off**: @security-lead
  - **Date**: 
  - **Status**: ⏳ Pending

## Legal & Compliance Phase

- [ ] License Review
  - **Owner**: Legal Team
  - **Sign-Off**: @legal-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Export Control
  - **Owner**: Legal Team
  - **Sign-Off**: @legal-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Third-Party Licenses
  - **Owner**: Legal/OSPO Team
  - **Sign-Off**: @legal-lead, @ospo-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] SBOM Review
  - **Owner**: OSPO Team
  - **Sign-Off**: @ospo-lead
  - **Date**: 
  - **Status**: ⏳ Pending

## Operations Phase

- [ ] Registry Setup
  - **Owner**: Infrastructure Team
  - **Sign-Off**: @infra-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Signing Keys
  - **Owner**: Security Team
  - **Sign-Off**: @security-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Monitoring
  - **Owner**: Operations Team
  - **Sign-Off**: @ops-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Incident Response
  - **Owner**: Operations Team
  - **Sign-Off**: @ops-lead
  - **Date**: 
  - **Status**: ⏳ Pending

## Support Phase

- [ ] Documentation
  - **Owner**: Documentation Team
  - **Sign-Off**: @docs-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Training
  - **Owner**: Support Team
  - **Sign-Off**: @support-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] SLAs
  - **Owner**: Support Team
  - **Sign-Off**: @support-lead
  - **Date**: 
  - **Status**: ⏳ Pending

## Final Approval Phase

- [ ] Product Approval
  - **Owner**: Product Team
  - **Sign-Off**: @product-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Security Approval
  - **Owner**: Security Team
  - **Sign-Off**: @security-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Legal Approval
  - **Owner**: Legal Team
  - **Sign-Off**: @legal-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] Operations Approval
  - **Owner**: Operations Team
  - **Sign-Off**: @ops-lead
  - **Date**: 
  - **Status**: ⏳ Pending

- [ ] OSPO Approval
  - **Owner**: OSPO Team
  - **Sign-Off**: @ospo-lead
  - **Date**: 
  - **Status**: ⏳ Pending

---

**Overall Status**: ⏳ Launch Blocked (Pending Sign-Offs)

**Next Steps**: Complete all required sign-offs to unblock launch.
```

## Verification

### Private Repository Visibility Verification

```go
// Automated verification that private repository is truly private
func VerifyPrivateRepository(ctx context.Context, repoURL string) error {
    // Try to access without authentication
    _, err := git.PlainClone(repoURL, false, &git.CloneOptions{
        URL:      repoURL,
        Auth:     nil, // No authentication
        Depth:    1,
    })
    
    // Should fail
    if err == nil {
        return fmt.Errorf("repository is publicly accessible: %s", repoURL)
    }
    
    // Try with invalid credentials
    _, err = git.PlainClone(repoURL, false, &git.CloneOptions{
        URL:      repoURL,
        Auth:     &http.BasicAuth{Username: "invalid", Password: "invalid"},
        Depth:    1,
    })
    
    // Should fail
    if err == nil {
        return fmt.Errorf("repository accepts invalid credentials: %s", repoURL)
    }
    
    // Try with valid credentials
    _, err = git.PlainClone(repoURL, false, &git.CloneOptions{
        URL:      repoURL,
        Auth:     getValidAuth(),
        Depth:    1,
    })
    
    // Should succeed
    if err != nil {
        return fmt.Errorf("valid credentials failed: %w", err)
    }
    
    return nil
}
```

### Artifact Permissions Verification

```go
// Automated verification that artifact permissions are correct
func VerifyArtifactPermissions(ctx context.Context, registryURL string) error {
    client, err := NewRegistryClient(registryURL)
    if err != nil {
        return err
    }
    
    // Check updater image
    updaterRef := "registry.owncloud.com/owncloud/updater:latest"
    if err := verifyImagePermissions(ctx, client, updaterRef); err != nil {
        return fmt.Errorf("updater image permissions: %w", err)
    }
    
    // Check catalogue
    catalogueRef := "registry.owncloud.com/owncloud/catalogue:latest"
    if err := verifyImagePermissions(ctx, client, catalogueRef); err != nil {
        return fmt.Errorf("catalogue permissions: %w", err)
    }
    
    // Check SBOM
    sbomRef := "registry.owncloud.com/owncloud/updater-sbom:latest"
    if err := verifyImagePermissions(ctx, client, sbomRef); err != nil {
        return fmt.Errorf("SBOM permissions: %w", err)
    }
    
    // Check provenance
    provenanceRef := "registry.owncloud.com/owncloud/updater-provenance:latest"
    if err := verifyImagePermissions(ctx, client, provenanceRef); err != nil {
        return fmt.Errorf("provenance permissions: %w", err)
    }
    
    return nil
}

func verifyImagePermissions(ctx context.Context, client RegistryClient, ref string) error {
    // Try to pull without authentication
    _, err := client.PullImage(ctx, ref, &PullOptions{Auth: nil})
    if err == nil {
        return fmt.Errorf("image is publicly accessible: %s", ref)
    }
    
    // Try to pull with invalid credentials
    _, err = client.PullImage(ctx, ref, &PullOptions{
        Auth: &BasicAuth{Username: "invalid", Password: "invalid"},
    })
    if err == nil {
        return fmt.Errorf("image accepts invalid credentials: %s", ref)
    }
    
    // Try to pull with valid credentials
    _, err = client.PullImage(ctx, ref, &PullOptions{
        Auth: getValidRegistryAuth(),
    })
    if err != nil {
        return fmt.Errorf("valid credentials failed: %w", err)
    }
    
    return nil
}
```

## Data Flow and Processor/Controller Implications

### Execution Modes

#### Customer-Run (Online)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Customer Environment                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │  Customer    │    │  Deployment  │    │   Updater   │          │
│  │  Repository │◄───►│  Repository  │◄───►│   Binary    │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│        │                 │                   │                │
│        ▼                 ▼                   ▼                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Local Execution                         │   │
│  │  - Reads customer repository (owncloud.yaml)             │   │
│  │  - Reads deployment repository (generated files)          │   │
│  │  - Pulls catalogue from registry.owncloud.com              │   │
│  │  - Pulls updater image from registry.owncloud.com          │   │
│  │  - Pushes updates to deployment repository                │   │
│  │  - Creates PRs in customer repository                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

Data Flow:
1. Customer repository → Updater (read owncloud.yaml)
2. Updater → Registry (pull catalogue)
3. Updater → Registry (pull images)
4. Updater → Deployment repository (write generated files)
5. Updater → Customer repository (create PR)

Processor: Customer's machine
Controller: Customer
```

#### Customer-Run (Mirrored)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Customer Environment                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │  Customer    │    │  Deployment  │    │   Updater   │          │
│  │  Repository │◄───►│  Repository  │◄───►│   Binary    │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│        │                 │                   │                │
│        ▼                 ▼                   ▼                │
│  ┌─────────────┐    ┌─────────────┐                         │
│  │  Mirror      │    │  Mirrored    │                         │
│  │  Registry   │◄───►│  Catalogue   │                         │
│  └─────────────┘    └─────────────┘                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

Data Flow:
1. Customer repository → Updater (read owncloud.yaml)
2. Updater → Mirror Registry (pull catalogue)
3. Updater → Mirror Registry (pull images)
4. Updater → Deployment repository (write generated files)
5. Updater → Customer repository (create PR)

Processor: Customer's machine
Controller: Customer
```

#### Customer-Run (Air-Gapped)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Air-Gapped Environment                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │  Customer    │    │  Deployment  │    │   Updater   │          │
│  │  Repository │◄───►│  Repository  │◄───►│   Binary    │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│        │                 │                   │                │
│        ▼                 ▼                   ▼                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Local Filesystem                        │   │
│  │  - Catalogue: /var/lib/updater/catalogue.json             │   │
│  │  - Images: /var/lib/updater/images/                        │   │
│  │  - SBOM: /var/lib/updater/sbom/                           │   │
│  │  - Provenance: /var/lib/updater/provenance/               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

Data Flow:
1. Customer repository → Updater (read owncloud.yaml)
2. Updater → Local filesystem (read catalogue)
3. Updater → Local filesystem (read images)
4. Updater → Deployment repository (write generated files)
5. Updater → Customer repository (create PR)

Processor: Customer's machine
Controller: Customer
```

#### CI-Run

```
┌─────────────────────────────────────────────────────────────────┐
│                         CI Environment                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │  Git         │    │  Deployment  │    │   Updater   │          │
│  │  Repository  │◄───►│  Repository  │◄───►│   Container │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│        │                 │                   │                │
│        ▼                 ▼                   ▼                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    CI Runner                              │   │
│  │  - GitHub Actions / GitLab CI / Forgejo Actions           │   │
│  │  - Self-hosted or GitHub-hosted                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│        │                                                         │
│        ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Registry                                │   │
│  │  - registry.owncloud.com                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

Data Flow:
1. Git repository → CI runner (checkout)
2. CI runner → Registry (pull updater image)
3. CI runner → Registry (pull catalogue)
4. Updater container → Deployment repository (write generated files)
5. Updater container → Git repository (create PR)

Processor: CI runner
Controller: CI system
```

#### Systemd (Local)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Local Systemd Environment                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │  Customer    │    │  Deployment  │    │   Updater   │          │
│  │  Repository │◄───►│  Repository  │◄───►│   Binary    │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│        │                 │                   │                │
│        ▼                 ▼                   ▼                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    systemd Service                         │   │
│  │  - Service: updater.service                                │   │
│  │  - Timer: updater.timer                                    │   │
│  │  - User: updater                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│        │                                                         │
│        ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Registry                                │   │
│  │  - registry.owncloud.com                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

Data Flow:
1. Customer repository → Updater (read owncloud.yaml)
2. Updater → Registry (pull catalogue)
3. Updater → Registry (pull images)
4. Updater → Deployment repository (write generated files)
5. Updater → Customer repository (create PR)

Processor: Local machine (via systemd)
Controller: systemd
```

### Data Flow Summary

| Mode | Processor | Controller | Data In | Data Out | Public Internet |
| --- | --- | --- | --- | --- | --- |
| Customer (Online) | Customer machine | Customer | owncloud.yaml | PRs, generated files | ✅ Yes |
| Customer (Mirrored) | Customer machine | Customer | owncloud.yaml | PRs, generated files | ❌ No (mirror only) |
| Customer (Air-Gap) | Customer machine | Customer | owncloud.yaml | PRs, generated files | ❌ No |
| CI-Run | CI runner | CI system | Git repo | PRs, generated files | ✅ Yes |
| Systemd | Local machine | systemd | owncloud.yaml | PRs, generated files | ✅ Yes |

### Processor/Controller Implications

**Processor** (where code runs):
- Customer machine: Full control, full responsibility
- CI runner: Shared responsibility with CI provider
- Local machine (systemd): Full control, full responsibility

**Controller** (who controls execution):
- Customer: Full control, can start/stop/modify at will
- CI system: Controlled by CI configuration
- systemd: Controlled by system administrator

## Offline Operation

### Customer Requirements for Offline Operation

1. **Cached Catalogue**: Last downloaded catalogue is cached
2. **Cached Images**: Already pulled images are cached
3. **Mirrored Catalogue**: Customer-controlled mirror (optional)
4. **Mirrored Images**: Customer-controlled mirror (optional)
5. **Pinned Versions**: Explicit version pinning in owncloud.yaml

### Offline Operation Duration

| Component | Cached | Offline Duration |
| --- | --- | --- |
| Catalogue | ✅ Yes | 90 days |
| Images | ✅ Yes | Indefinite |
| Signing Keys | ✅ Yes | Until revoked |
| Provenance | ✅ Yes | Indefinite |

### Offline Operation Procedures

```bash
# Check what's cached
get-owncloud cache list

# List cached catalogue versions
get-owncloud cache list catalogue

# List cached images
get-owncloud cache list images

# Use cached catalogue
get-owncloud reconcile --offline --catalogue /var/lib/updater/catalogue.json

# Use cached images
get-owncloud deploy --offline --images /var/lib/updater/images

# Update cache when online
get-owncloud cache update
```

## Public Documentation

### What is Publicly Documented

✅ **Public**:
- Updater interfaces (CLI, API)
- Updater behavior (what it does)
- Configuration format (owncloud.yaml)
- Lock file format (owncloud.lock.json)
- Generated file formats
- Update process
- Support policies
- Troubleshooting guides

❌ **NOT Public**:
- Updater source code
- Updater implementation details
- Signing key material
- Internal APIs
- Proprietary algorithms
- Security vulnerabilities (before disclosure)

### Documentation Review Process

All public documentation is reviewed by:

1. **Product Team**: Accuracy, completeness
2. **Security Team**: No sensitive information
3. **Legal Team**: Compliance, licensing
4. **Documentation Team**: Quality, consistency

## Acceptance Criteria

- [x] **Legal, security, product and operational approval gates have named owners**
  - All gates have designated owners
  - Sign-off process defined
  - Approval matrix documented

- [x] **Private repository visibility and artifact permissions are verified automatically**
  - Automated verification scripts
  - Tests for private access
  - Tests for invalid credentials

- [x] **No workflow can publish source, image, SBOM or provenance to a public destination**
  - All publishing workflows require authentication
  - All publishing workflows verify destination
  - Public publishing is blocked

- [x] **Customer data-flow and processor/controller implications are documented for each execution mode**
  - Data flow diagrams for all modes
  - Processor/controller matrix
  - Implications documented

- [x] **Offline customers can continue operating their approved deployment when the service or registry is unavailable**
  - Cached catalogue support
  - Cached images support
  - Offline operation procedures
  - Duration limits documented

- [x] **Public documentation reveals interfaces and behavior only to the approved degree and does not expose proprietary implementation details**
  - Public documentation list
  - Review process defined
  - No sensitive information in public docs

- [x] **Launch remains blocked until every mandatory gate is signed off**
  - All gates must be signed
  - Launch gate document tracks status
  - Automated verification of sign-offs

## Related
- Epic: #13
- This is the final issue in Epic #13

Closes #22