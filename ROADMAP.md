# Delivery roadmap

All nine RFC areas remain in scope. The phases below sequence dependencies and feedback; they do not
turn later areas into optional work.

| RFC | Deliverable | Phase | Complexity | Dependencies | Current blocker | Relative effort |
| --- | --- | --- | --- | --- | --- | --- |
| #2 | Governance and Pages shell | 1 | Medium | Brand/legal reviewers | Approved logo asset | 1 unit |
| #3 | Profile, policy and catalogue | 1 | High | Pinned upstream sources | Maintainer authority assignments | 3 units |
| #4 | Part 1 + Docker/Podman | 1 | High | #3 | Multi-distribution runtime matrix | 4 units |
| #5 | Production bootstrap/EULA/update | 1 | High | #3, #4 | Legal clickwrap and release-signing approval | 4 units |
| #6 | Kubernetes/Helm | 2 | High | #3 | No published chart currently matching oCIS 8.2 | 4 units |
| #7 | Argo CD wrapper | 2 | Medium | #6 | Existing compatible controller required in v1 | 2 units |
| #8 | Ansible wrapper | 2 | Medium | #4 | Distribution and Podman promotion matrices | 3 units |
| #9 | Configurator/sizing/discoverability | 2 | High | #3–#8 contracts | Source-backed sizing review | 4 units |
| #10 | Release integrity and launch | 3 | High | All advertised targets | DNS, brand, legal, support and security gates | 3 units |

Docker/Podman is the first community-testing path. Kubernetes follows the stable profile contract;
Ansible and Argo CD follow the native family they wrap.

## Implementation status

“Code complete” below means the repository contains the implementation and automated contract. It does
not waive a runtime promotion, named review, legal approval or production launch gate.

| RFC | Repository implementation | Remaining exit condition |
| --- | --- | --- |
| #2 | Code complete: governance, Pages shell, official source-locked logo and development `noindex` | Explicit brand/legal approval |
| #3 | Code complete: strict profile, policy, feature/update catalogues and scheduled upstream/security drift discovery | Maintainer authority assignment and review of future drift reports |
| #4 | Docker live-tested on Ubuntu 22.04/24.04; Podman is live-tested as Community Preview; retained distro adapters are deterministic and fail closed | Real runtime plus SELinux/AppArmor evidence before promoting any additional platform |
| #5 | Code complete: fail-closed bootstrap, explicit EULA acknowledgement, backup/health/rollback-gated update path and release evidence | Legal clickwrap and release-signing approval |
| #6 | Intentionally open: runnable Community Preview held at chart 0.7.0 / oCIS 7.1.4 | User-owned later decision; do not promote or close automatically |
| #7 | Code complete at the #6 boundary: equivalent Helm values, least-privilege project and explicit existing-controller/CRD/RBAC readiness checks | Inherits #6; compatible existing Argo CD controller required |
| #8 | Docker and rootless-Podman live double-apply idempotence plus syntax checks implemented | Distribution/Podman promotion matrix before broader production claims |
| #9 | Code complete: shared browser/CLI generator, source-backed sizing, accessibility, SEO, structured data and `llms.txt` | Named sizing maintainer review and production crawl approval |
| #10 | Code complete: every `v*` tag requires the reusable full E2E gate before SBOM/provenance attestation | DNS, brand, legal, support, security and advertised-target runtime approvals |

Therefore the roadmap is fully represented in code, but it is not fully released: #6 is deliberately
open, and the explicit external/promotion conditions above remain blocking. Scheduled discovery opens a
single review issue when sources, the EULA or same-minor security releases drift; it never changes a pin.

## Contingencies without scope reduction

| If this cannot safely ship yet | The project does this | Exit condition |
| --- | --- | --- |
| A prerequisite adapter is unverified on one platform | Keeps that platform visible as blocked, refuses mutation and continues testing the remaining matrix | Adapter has double-run and functional verification evidence |
| A chart matching the pinned oCIS release is unavailable | Keeps Kubernetes/Argo CD in scope as Community Preview/blocked and continues schema/render-equivalence work | Compatible chart pin plus chart-owner approval |
| Production support approval is missing | Emits evaluation or Community Preview output only | Named owner approves the support statement and runtime gate |
| Brand approval is missing | Serves the source-locked official logo with a visible development-preview banner and noindex | Explicit ownCloud/Kiteworks brand-use approval is recorded |
| EULA wording or hash changes | Allows inspection but blocks runnable output | Joint legal review and new acknowledgement version |
| Sizing evidence is incomplete | Shows the formula as provisional and requires conservative defaults plus load testing | Evidence is versioned and reviewed |
| A wrapper drifts from its native renderer | Blocks the wrapper, not the underlying family | CI render-equivalence is restored |

No contingency silently drops Docker, Podman, Kubernetes, Helm, Ansible, Argo CD or the web configurator.
