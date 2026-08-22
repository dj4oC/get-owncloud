# Catalogue maintenance

## Upstream authority matrix

Authority is target-specific and version-pinned; no single source is allowed to override every concern.

| Question | Primary authority | Secondary evidence | Conflict behavior |
| --- | --- | --- | --- |
| Helm value shape/type/default | Pinned chart `values.schema.json` | Chart README/templates | Block mapping and open a compatibility review |
| Compose topology/overlay | Pinned `ocis_full` example | Exact-version admin docs | Block renderer if example and release are incompatible |
| Policy, support and maturity | Exact-version oCIS admin docs/release notes | Maintainer approval | Safer policy wins; experimental remains denied |
| Cross-family oCIS version | Compatibility lock | Chart `appVersion` and Compose image | Both families may not claim the same release until versions align |
| External component sizing | Versioned vendor documentation | Load-test evidence | Use the more conservative evidenced value |
| Blogs/tutorials | Never authoritative | Discovery signal only | Create an unmapped item; never change output |

The precedence and exact source hashes are versioned with every catalogue update. The current chart
`0.7.0` declares appVersion `7.1.4`, so the runnable Kubernetes output stays a 7.1.4 Community Preview and
is not a valid oCIS 8.2 production baseline. Issue #6 remains the explicit promotion gate.

## Change flow

1. Scheduled discovery opens a reviewable change; it never changes generated production output.
2. The proposer supplies source/version, user impact, maturity, dependencies, conflicts and mappings.
3. New or unknown maturity defaults to denied.
4. Native renderer owner reviews target correctness; OSPO/security/legal review policy-sensitive fields.
5. Positive, negative, drift and golden tests must pass.
6. Production eligibility additionally requires the named upstream owner and release gate.

Catalogue changes can be proposed by any collaborator. Merging requires the interim CODEOWNER plus the
relevant native renderer owner once that role is assigned.
