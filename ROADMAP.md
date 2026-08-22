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
