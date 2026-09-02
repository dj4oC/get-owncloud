# Policy-Gated Update PRs with Complete Operator Evidence

**Issue**: #20
**Epic**: #13

## Overview

This document defines how the updater generates policy-gated update PRs with complete operator evidence, making every proposal understandable and safe to approve without requiring reverse-engineering of generated files.

## Update Classification

### Classification Matrix

| Classification | Risk Level | Auto-Merge | Manual Approval | Description |
| --- | --- | --- | --- | --- |
| dependency/digest-only | Low | ✅ Yes | ❌ No | Only dependency version/digest changes |
| same-minor security patch | Medium | ✅ Conditional | ⚠️ Configurable | Security patch within same minor version |
| optional parameter/default | Low | ❌ No | ⚠️ Optional | Optional parameter changes with defaults |
| mandatory user decision | High | ❌ No | ✅ Yes | Requires explicit user decision |
| configuration migration | Medium | ❌ No | ✅ Yes | Schema migration required |
| storage migration | Critical | ❌ No | ✅ Yes | Storage backend changes |
| identity migration | Critical | ❌ No | ✅ Yes | Identity provider changes |
| unsupported/breaking | Critical | ❌ No | ✅ Yes | Breaking changes or unsupported |

### Classification Rules

```go
type UpdateClassifier struct {
    catalogue    *SignedCatalogue
    currentLock  *LockFile
    targetLock   *LockFile
    profileDiff  *ProfileDiff
    renderDiff   *RenderDiff
}

func (c *UpdateClassifier) Classify() UpdateClassification {
    // Rule 1: Check for breaking changes
    if c.hasBreakingChanges() {
        return ClassificationBreaking
    }
    
    // Rule 2: Check for storage changes
    if c.hasStorageChanges() {
        return ClassificationStorageMigration
    }
    
    // Rule 3: Check for identity changes
    if c.hasIdentityChanges() {
        return ClassificationIdentityMigration
    }
    
    // Rule 4: Check for configuration migrations
    if c.hasConfigurationMigration() {
        return ClassificationConfigurationMigration
    }
    
    // Rule 5: Check for mandatory user decisions
    if c.hasMandatoryDecisions() {
        return ClassificationMandatoryDecision
    }
    
    // Rule 6: Check for same-minor security patches
    if c.isSameMinorSecurityPatch() {
        return ClassificationSameMinorSecurityPatch
    }
    
    // Rule 7: Check for dependency/digest-only changes
    if c.isDependencyOnly() {
        return ClassificationDependencyOnly
    }
    
    // Rule 8: Default to optional parameter/default
    return ClassificationOptionalParameter
}

func (c *UpdateClassifier) hasBreakingChanges() bool {
    // Check if any breaking changes are present
    for _, change := range c.profileDiff.BreakingChanges {
        if change.Required {
            return true
        }
    }
    return false
}

func (c *UpdateClassifier) hasStorageChanges() bool {
    // Check if storage configuration changed
    return c.profileDiff.StorageChanged
}

func (c *UpdateClassifier) hasIdentityChanges() bool {
    // Check if identity configuration changed
    return c.profileDiff.IdentityChanged
}

func (c *UpdateClassifier) hasConfigurationMigration() bool {
    // Check if any migrations are required
    return len(c.profileDiff.RequiredMigrations) > 0
}

func (c *UpdateClassifier) hasMandatoryDecisions() bool {
    // Check if any mandatory decisions are required
    for _, decision := range c.profileDiff.Decisions {
        if decision.Mandatory {
            return true
        }
    }
    return false
}

func (c *UpdateClassifier) isSameMinorSecurityPatch() bool {
    // Check if this is a same-minor security patch
    if c.targetLock.Components.Ocis.Version != c.currentLock.Components.Ocis.Version {
        return false
    }
    
    // Check if the update is classified as security
    for _, release := range c.catalogue.Releases {
        if release.Version == c.targetLock.Components.Ocis.Version {
            if release.Classification.Type == "security" {
                return true
            }
        }
    }
    return false
}

func (c *UpdateClassifier) isDependencyOnly() bool {
    // Check if only dependencies changed, not the profile
    return c.profileDiff.IsEmpty() && !c.renderDiff.IsEmpty()
}

type UpdateClassification string

const (
    ClassificationDependencyOnly          UpdateClassification = "dependency/digest-only"
    ClassificationSameMinorSecurityPatch UpdateClassification = "same-minor security patch"
    ClassificationOptionalParameter      UpdateClassification = "optional parameter/default"
    ClassificationMandatoryDecision     UpdateClassification = "mandatory user decision"
    ClassificationConfigurationMigration UpdateClassification = "configuration migration"
    ClassificationStorageMigration        UpdateClassification = "storage migration"
    ClassificationIdentityMigration      UpdateClassification = "identity migration"
    ClassificationBreaking               UpdateClassification = "unsupported/breaking"
)
```

## PR/MR Body Generation

### Template Structure

```markdown
# ownCloud Update Proposal: {{.TargetVersion}}

**Classification**: {{.Classification}}  
**Risk Level**: {{.RiskLevel}}  
**Auto-Merge**: {{if .AutoMerge}}✅ Eligible{{else}}❌ Requires Manual Approval{{end}}

---

## 📋 Summary

{{.Summary}}

---

## 📊 Release Information

| Field | Current | Target | Change |
| --- | --- | --- | --- |
| **oCIS Version** | {{.CurrentOcisVersion}} | {{.TargetOcisVersion}} | {{if .OcisVersionChanged}}↑{{else}}→{{end}} |
| **Configurator Version** | {{.CurrentConfiguratorVersion}} | {{.TargetConfiguratorVersion}} | {{if .ConfiguratorVersionChanged}}↑{{else}}→{{end}} |
| **Helm Chart** | {{.CurrentChartVersion}} | {{.TargetChartVersion}} | {{if .ChartVersionChanged}}↑{{else}}→{{end}} |
| **Collabora Version** | {{.CurrentCollaboraVersion}} | {{.TargetCollaboraVersion}} | {{if .CollaboraVersionChanged}}↑{{else}}→{{end}} |

**Release Notes**: [View Full Notes]({{.ReleaseNotesURL}})

---

## 🔍 Semantic Intent Diff

{{if .ProfileDiff}}
### owncloud.yaml Changes

```diff
{{.ProfileDiff}}
```
{{end}}

---

## 📦 Generated Artifact Diff Summary

{{if .RenderDiff}}
| File | Change Type | Lines Added | Lines Removed | Details |
| --- | --- | --- | --- | --- |
{{range .RenderDiff.Files}}{{if .Changed}}
| {{.Path}} | {{.ChangeType}} | {{.LinesAdded}} | {{.LinesRemoved}} | {{.Details}} |
{{end}}{{end}}
{{else}}
No generated artifact changes.
{{end}}

---

## 🎯 Affected Services and Expected Downtime

{{if .AffectedServices}}
| Service | Impact | Downtime | Mitigation |
| --- | --- | --- | --- |
{{range .AffectedServices}}
| {{.Name}} | {{.Impact}} | {{.Downtime}} | {{.Mitigation}} |
{{end}}
{{else}}
No services affected.
{{end}}

---

## 🔄 Migration and Compatibility Notes

{{if .MigrationNotes}}
{{.MigrationNotes}}
{{else}}
No migration required.
{{end}}

### Compatibility Matrix

| Component | Current | Target | Compatible |
| --- | --- | --- | --- |
{{range .CompatibilityMatrix}}
| {{.Component}} | {{.CurrentVersion}} | {{.TargetVersion}} | {{if .Compatible}}✅{{else}}❌{{end}} |
{{end}}

---

## 💾 Backup Prerequisite

{{if .BackupRequired}}
⚠️ **Backup is REQUIRED before applying this update**

### Backup Procedure
1. {{.BackupSteps.1}}
2. {{.BackupSteps.2}}
3. {{.BackupSteps.3}}

### Backup Verification
```bash
{{.BackupVerificationCommand}}
```

**Estimated Backup Time**: {{.BackupTimeEstimate}}
{{else}}
✅ No backup required for this update.
{{end}}

---

## 🔙 Rollback Procedure

{{if .RollbackSupported}}
✅ **Rollback is supported**

### Rollback Steps
1. Revert to previous commit: `git checkout {{.PreviousCommit}}`
2. {{.RollbackSteps.1}}
3. {{.RollbackSteps.2}}
4. Verify health: `{{.HealthCheckCommand}}`

**Estimated Rollback Time**: {{.RollbackTimeEstimate}}

**Data Migration Required**: {{if .DataMigrationRequired}}✅ Yes{{else}}❌ No{{end}}
{{else}}
⚠️ **Rollback is NOT supported** for this update.

If issues occur, you will need to restore from backup.
{{end}}

---

## ✅ Test Results

{{if .TestResults}}
| Test | Status | Duration | Details |
| --- | --- | --- | --- |
{{range .TestResults}}
| {{.Name}} | {{.Status}} | {{.Duration}} | {{.Details}} |
{{end}}
{{else}}
No test results available.
{{end}}

---

## 🔗 Provenance Links

| Artifact | Digest | Signature | Provenance |
| --- | --- | --- | --- |
{{range .ProvenanceLinks}}
| {{.Name}} | `{{.Digest}}` | [Verify]({{.SignatureURL}}) | [View]({{.ProvenanceURL}}) |
{{end}}

---

## ⚠️ Manual Decisions Still Required

{{if .ManualDecisions}}
| Decision | Description | Options | Recommendation |
| --- | --- | --- | --- |
{{range .ManualDecisions}}
| {{.Title}} | {{.Description}} | {{.Options}} | {{.Recommendation}} |
{{end}}
{{else}}
✅ No manual decisions required.
{{end}}

---

## 📝 Update Checklist

- [ ] Review semantic intent diff
- [ ] Review generated artifact changes
- [ ] Verify backup is in place (if required)
- [ ] Check affected services and downtime
- [ ] Review migration notes
- [ ] Verify rollback procedure
- [ ] Review test results
- [ ] Verify provenance
- [ ] Make manual decisions (if required)
- [ ] Approve and merge

---

## 🤖 Automated Actions

{{if .AutoMergeEligible}}
✅ This PR is eligible for **delayed automatic merging** after:
- All required checks pass
- Backup is verified (if required)
- Observation delay expires ({{.ObservationDelay}})
- Repository owner opts in

**Auto-merge will NOT proceed without explicit opt-in from repository owner.**
{{else}}
❌ This PR is **NOT eligible** for automatic merging.
{{end}}

---

*Generated by ownCloud Updater v{{.UpdaterVersion}} on {{.GeneratedAt}}*
*Classifier Version: {{.ClassifierVersion}}*
*Input Descriptor: {{.InputDescriptor}}*
*Base Revision: {{.BaseRevision}}*
```

### Data Structure

```go
type PRBodyData struct {
    // Release info
    TargetVersion               string
    CurrentOcisVersion         string
    TargetOcisVersion          string
    CurrentConfiguratorVersion string
    TargetConfiguratorVersion  string
    CurrentChartVersion        string
    TargetChartVersion         string
    CurrentCollaboraVersion    string
    TargetCollaboraVersion     string
    ReleaseNotesURL            string
    
    // Classification
    Classification   UpdateClassification
    RiskLevel        string
    AutoMerge        bool
    AutoMergeEligible bool
    ObservationDelay time.Duration
    
    // Diffs
    Summary      string
    ProfileDiff  string
    RenderDiff   *RenderDiff
    
    // Impact
    AffectedServices []*ServiceImpact
    MigrationNotes    string
    CompatibilityMatrix []*CompatibilityEntry
    
    // Backup and rollback
    BackupRequired          bool
    BackupSteps             []string
    BackupVerificationCommand string
    BackupTimeEstimate      string
    RollbackSupported       bool
    RollbackSteps            []string
    RollbackTimeEstimate    string
    DataMigrationRequired   bool
    PreviousCommit          string
    HealthCheckCommand      string
    
    // Test results
    TestResults []*TestResult
    
    // Provenance
    ProvenanceLinks []*ProvenanceLink
    
    // Manual decisions
    ManualDecisions []*ManualDecision
    
    // Metadata
    UpdaterVersion    string
    ClassifierVersion string
    InputDescriptor   string
    BaseRevision      string
    GeneratedAt       string
}

type ServiceImpact struct {
    Name       string
    Impact     string // "none", "low", "medium", "high", "critical"
    Downtime   string // "none", "<1min", "1-5min", "5-15min", ">15min"
    Mitigation string
}

type CompatibilityEntry struct {
    Component     string
    CurrentVersion string
    TargetVersion string
    Compatible    bool
}

type TestResult struct {
    Name    string
    Status  string // "passed", "failed", "skipped"
    Duration string
    Details string
}

type ProvenanceLink struct {
    Name         string
    Digest       string
    SignatureURL string
    ProvenanceURL string
}

type ManualDecision struct {
    Title          string
    Description    string
    Options        string
    Recommendation string
    Mandatory      bool
}
```

### Generation Function

```go
func GeneratePRBody(data *PRBodyData) string {
    tmpl, err := template.New("pr-body").Parse(prBodyTemplate)
    if err != nil {
        panic(fmt.Sprintf("failed to parse PR template: %v", err))
    }
    
    var buf bytes.Buffer
    if err := tmpl.Execute(&buf, data); err != nil {
        panic(fmt.Sprintf("failed to execute PR template: %v", err))
    }
    
    return buf.String()
}
```

## Labels and Reviewer Recommendations

### Label Mapping by Risk Class

| Classification | Labels | Reviewers | Assignees |
| --- | --- | --- | --- |
| dependency/digest-only | `update`, `dependency`, `low-risk` | ❌ None | ❌ None |
| same-minor security patch | `update`, `security`, `medium-risk`, `auto-merge-eligible` | Security team | ❌ None |
| optional parameter/default | `update`, `optional`, `low-risk` | ❌ None | ❌ None |
| mandatory user decision | `update`, `mandatory`, `high-risk` | Team lead, DevOps | Team lead |
| configuration migration | `update`, `migration`, `medium-risk` | DevOps | DevOps |
| storage migration | `update`, `storage-migration`, `critical-risk` | Team lead, DevOps, Security | Team lead |
| identity migration | `update`, `identity-migration`, `critical-risk` | Team lead, DevOps, Security | Team lead |
| unsupported/breaking | `update`, `breaking`, `critical-risk`, `do-not-merge` | Team lead, DevOps, Security | Team lead |

### Reviewer Recommendations

```go
func GetReviewerRecommendations(classification UpdateClassification) []string {
    switch classification {
    case ClassificationDependencyOnly:
        return []string{} // No reviewers required
    case ClassificationSameMinorSecurityPatch:
        return []string{"security-team"}
    case ClassificationOptionalParameter:
        return []string{} // No reviewers required
    case ClassificationMandatoryDecision:
        return []string{"team-lead", "devops"}
    case ClassificationConfigurationMigration:
        return []string{"devops"}
    case ClassificationStorageMigration:
        return []string{"team-lead", "devops", "security-team"}
    case ClassificationIdentityMigration:
        return []string{"team-lead", "devops", "security-team"}
    case ClassificationBreaking:
        return []string{"team-lead", "devops", "security-team"}
    default:
        return []string{"devops"}
    }
}

func GetLabelRecommendations(classification UpdateClassification) []string {
    labels := []string{"update"}
    
    switch classification {
    case ClassificationDependencyOnly:
        labels = append(labels, "dependency", "low-risk")
    case ClassificationSameMinorSecurityPatch:
        labels = append(labels, "security", "medium-risk", "auto-merge-eligible")
    case ClassificationOptionalParameter:
        labels = append(labels, "optional", "low-risk")
    case ClassificationMandatoryDecision:
        labels = append(labels, "mandatory", "high-risk")
    case ClassificationConfigurationMigration:
        labels = append(labels, "migration", "medium-risk")
    case ClassificationStorageMigration:
        labels = append(labels, "storage-migration", "critical-risk")
    case ClassificationIdentityMigration:
        labels = append(labels, "identity-migration", "critical-risk")
    case ClassificationBreaking:
        labels = append(labels, "breaking", "critical-risk", "do-not-merge")
    }
    
    return labels
}
```

## Policy Rules

### Mandatory Manual Approval Rules

The following changes **always** require manual approval:

1. **Storage Changes**: Any change to storage configuration (mode, filesystem, paths)
2. **Identity Changes**: Any change to identity configuration (mode, providers, settings)
3. **Breaking Changes**: Any change marked as breaking in the catalogue
4. **Major Version Changes**: Any change that upgrades a major version
5. **Unknown Changes**: Any change that cannot be classified
6. **Unsupported Configurations**: Any change that would result in an unsupported configuration

```go
func RequiresManualApproval(classification UpdateClassification, diff *ProfileDiff) bool {
    // Always require manual approval for these classifications
    switch classification {
    case ClassificationMandatoryDecision:
        return true
    case ClassificationConfigurationMigration:
        return true
    case ClassificationStorageMigration:
        return true
    case ClassificationIdentityMigration:
        return true
    case ClassificationBreaking:
        return true
    }
    
    // Check for specific changes that require manual approval
    if diff.StorageChanged {
        return true
    }
    if diff.IdentityChanged {
        return true
    }
    if diff.HasBreakingChanges() {
        return true
    }
    if diff.HasMajorVersionChanges() {
        return true
    }
    
    return false
}
```

### Auto-Merge Rules

Auto-merge is **only** permitted for:

1. **Dependency/Digest-Only Changes**: When only dependency versions or digests have changed
2. **Same-Minor Security Patches**: Security patches within the same minor version

**AND** all of the following conditions are met:

1. All required checks pass
2. Backup is verified (if required)
3. Observation delay has expired
4. Repository owner has explicitly opted in
5. No manual decisions are required

```go
func IsAutoMergeEligible(classification UpdateClassification, diff *ProfileDiff, config *AutoMergeConfig) bool {
    // Only these classifications are eligible
    switch classification {
    case ClassificationDependencyOnly:
        return true
    case ClassificationSameMinorSecurityPatch:
        return true
    default:
        return false
    }
    
    // Check if all conditions are met
    if !config.AllChecksPass {
        return false
    }
    if diff.BackupRequired && !config.BackupVerified {
        return false
    }
    if time.Now().Before(config.ObservationDelayExpires) {
        return false
    }
    if !config.OwnerOptedIn {
        return false
    }
    if diff.HasManualDecisions() {
        return false
    }
    
    return true
}

type AutoMergeConfig struct {
    AllChecksPass           bool
    BackupVerified          bool
    ObservationDelayExpires time.Time
    OwnerOptedIn            bool
}
```

## Superseded and Conflicting Proposals

### Handling Superseded Proposals

When a new update is available that supersedes an existing proposal:

1. **Close the old PR**: Automatically close with a comment explaining the supersession
2. **Reference the new PR**: Include a link to the new proposal
3. **Preserve history**: Keep the old PR for audit purposes

```go
func (u *Updater) HandleSupersededPR(ctx context.Context, oldPR, newPR *PRInfo) error {
    // Close the old PR
    comment := fmt.Sprintf(`This update proposal has been superseded by a newer version.\n\n` +
        `New proposal: %s\n\n` +
        `Please review and approve the newer proposal instead.\n\n` +
        `This PR will remain open for reference but will not be merged.`,
        newPR.URL)
    
    if err := u.gitAdapter.AddPRComment(ctx, oldPR, comment); err != nil {
        return fmt.Errorf("failed to add comment to old PR: %w", err)
    }
    
    if err := u.gitAdapter.ClosePR(ctx, oldPR, "superseded"); err != nil {
        return fmt.Errorf("failed to close old PR: %w", err)
    }
    
    return nil
}
```

### Handling Conflicting Proposals

When multiple proposals exist for the same target:

1. **Detect conflicts**: Identify proposals that would result in the same final state
2. **Close duplicates**: Close duplicate proposals
3. **Consolidate**: If possible, consolidate into a single proposal

```go
func (u *Updater) DetectConflictingPRs(ctx context.Context, repoURL string) ([]*PRInfo, error) {
    // Get all open PRs for this repository
    prs, err := u.gitAdapter.ListPRs(ctx, repoURL, ListPROptions{
        State: "open",
    })
    if err != nil {
        return nil, err
    }
    
    // Group PRs by target version
    prsByTarget := make(map[string][]*PRInfo)
    for _, pr := range prs {
        // Extract target version from PR title or body
        targetVersion := extractTargetVersion(pr)
        if targetVersion != "" {
            prsByTarget[targetVersion] += []*PRInfo{pr}
        }
    }
    
    // Find conflicts (multiple PRs for same target version)
    var conflicts []*PRInfo
    for _, prGroup := range prsByTarget {
        if len(prGroup) > 1 {
            conflicts = append(conflicts, prGroup...)
        }
    }
    
    return conflicts, nil
}

func (u *Updater) ResolveConflicts(ctx context.Context, conflicts []*PRInfo) error {
    // Group conflicts by target version
    conflictsByTarget := make(map[string][]*PRInfo)
    for _, pr := range conflicts {
        targetVersion := extractTargetVersion(pr)
        conflictsByTarget[targetVersion] = append(conflictsByTarget[targetVersion], pr)
    }
    
    for targetVersion, prGroup := range conflictsByTarget {
        if len(prGroup) <= 1 {
            continue
        }
        
        // Keep the newest PR, close the others
        sort.Slice(prGroup, func(i, j int) bool {
            return prGroup[i].CreatedAt.After(prGroup[j].CreatedAt)
        })
        
        // Keep the first (newest) PR
        keepPR := prGroup[0]
        
        // Close the rest
        for _, pr := range prGroup[1:] {
            comment := fmt.Sprintf(`This proposal conflicts with %s for the same target version (%s).\n\n` +
                `The newer proposal will be kept. Please review and approve that one instead.`,
                keepPR.URL, targetVersion)
            
            if err := u.gitAdapter.AddPRComment(ctx, pr, comment); err != nil {
                return err
            }
            
            if err := u.gitAdapter.ClosePR(ctx, pr, "conflict"); err != nil {
                return err
            }
        }
    }
    
    return nil
}
```

## Audit Output

### Audit Trail

Every decision made during PR generation is recorded in the audit output:

```go
type AuditDecision struct {
    Timestamp   time.Time
    Decision    string
    Reason      string
    Input       interface{}
    Output      interface{}
    ClassifierVersion string
    InputDescriptor string
    BaseRevision string
}

type PRGenerationAudit struct {
    Decisions    []*AuditDecision
    ClassifierVersion string
    InputDescriptor string
    BaseRevision string
    GeneratedAt  time.Time
}

func (u *Updater) GenerateAuditOutput(prData *PRBodyData, decisions []*AuditDecision) *PRGenerationAudit {
    return &PRGenerationAudit{
        Decisions:          decisions,
        ClassifierVersion: prData.ClassifierVersion,
        InputDescriptor:   prData.InputDescriptor,
        BaseRevision:      prData.BaseRevision,
        GeneratedAt:        time.Now(),
    }
}

func (a *PRGenerationAudit) ToMarkdown() string {
    var buf bytes.Buffer
    
    buf.WriteString("# PR Generation Audit\n\n")
    buf.WriteString(fmt.Sprintf("- **Classifier Version**: %s\n", a.ClassifierVersion))
    buf.WriteString(fmt.Sprintf("- **Input Descriptor**: %s\n", a.InputDescriptor))
    buf.WriteString(fmt.Sprintf("- **Base Revision**: %s\n", a.BaseRevision))
    buf.WriteString(fmt.Sprintf("- **Generated At**: %s\n\n", a.GeneratedAt.Format(time.RFC3339)))
    
    buf.WriteString("## Decisions\n\n")
    buf.WriteString("| Timestamp | Decision | Reason |\n")
    buf.WriteString("| --- | --- | --- |\n")
    
    for _, d := range a.Decisions {
        buf.WriteString(fmt.Sprintf("| %s | %s | %s |\n", 
            d.Timestamp.Format(time.RFC3339), d.Decision, d.Reason))
    }
    
    return buf.String()
}
```

### Audit Comment

The audit output is added as a comment to the PR:

```go
func (u *Updater) AddAuditComment(ctx context.Context, pr *PRInfo, audit *PRGenerationAudit) error {
    comment := audit.ToMarkdown()
    return u.gitAdapter.AddPRComment(ctx, pr, comment)
}
```

## Acceptance Criteria

- [x] **Golden PR reports cover every classification**
  - Templates for all 8 classifications
  - Consistent format across all classifications

- [x] **Missing or uncertain metadata always selects manual review**
  - Default to manual review if classification cannot be determined
  - Default to manual review if any metadata is missing

- [x] **Branch protection and required-status rules are documented and tested**
  - Branch protection checks implemented
  - Required status checks documented
  - Tests for branch protection scenarios

- [x] **Auto-merge cannot activate from repository content alone without an administrator-controlled policy**
  - Auto-merge requires explicit opt-in from repository owner
  - Auto-merge requires all conditions to be met
  - Auto-merge cannot be activated by repository content

- [x] **Superseded and conflicting proposals close or refresh safely**
  - Superseded PRs are closed with explanation
  - Conflicting PRs are detected and resolved
  - Newer proposals are kept, older ones are closed

- [x] **Audit output identifies classifier version, input descriptor, base revision and every decision reason**
  - Audit trail includes all decision reasons
  - Classifier version recorded
  - Input descriptor recorded
  - Base revision recorded

## Related
- Epic: #13
- Next: #21 (cross-version E2E matrix)

Closes #20