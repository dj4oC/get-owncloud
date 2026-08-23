# Launch gates

## Blocking and advisory checklist

| Gate | Class | Owner role | Evidence |
| --- | --- | --- | --- |
| `get.owncloud.com` approval and DNS control | Blocking | ownCloud infrastructure | DNS/TLS verification |
| ownCloud logo and “Deploy ownCloud by Kiteworks” brand use | Blocking | ownCloud/Kiteworks brand approver | Vendored upstream asset/source record plus explicit use approval |
| EULA wording and interaction | Blocking | Joint ownCloud/Kiteworks legal | Approved copy/hash/version |
| Production-support statement | Blocking per target | oCIS/chart owner | Signed support/maturity record |
| Bootstrap checksum, SBOM and attestation | Blocking | Named security owner | Verifiable release evidence |
| Security/supply-chain review | Blocking | Security owner | Review record |
| Advertised maturity runtime matrix | Blocking | Target maintainer | CI/runtime report |
| Accessibility | Blocking | Web/UX maintainer | axe-core clean at WCAG 2.1 AA with zero serious/critical violations, plus keyboard-only journeys |
| Support/maturity documentation | Advisory before preview; blocking before production | Product/support | Published matrix |
| Troubleshooting guide | Advisory for preview | Maintainers/support | Link check |
| Contribution guide | Advisory for private preview; blocking for public community launch | OSPO | Published policy |
| Additional target matrix beyond advertised maturity | Advisory | Target maintainers | Scheduled test results |
| Redirect wording/polish | Advisory | Docs/product | Redirect report |

## Publication timeline

1. Private RFC review: named collaborators only; no production claim.
2. Public repository: after governance, policy and the safe Docker vertical slice (#2–#4) land.
3. Public development site: official source-locked asset, visibly marked preview and indexing disabled.
4. Production `get.owncloud.com`: only after every blocking gate for advertised targets passes.
5. Community Preview targets graduate independently without holding back already-approved families.

## Provenance chain

Release tag → protected workflow → commit → `sources.lock`/compatibility catalogue → checksums/SBOM →
GitHub OIDC/Sigstore attestation → generated artifact. The bootstrap script itself is a specifically
blocking attested artifact because the production domain implies ownCloud endorsement.

## Current code evidence versus external approval

- Implemented: official source-locked logo, local EULA interaction, policy/schema checks, SBOM/attestation
  workflow, browser accessibility workflow, Docker/Collabora and rootless-Podman WebDAV backup/restore
  lifecycles, Ansible double-apply, Helm/Argo equivalence and a single aggregate Full E2E code gate.
- Still externally open: production DNS/TLS delegation, explicit brand-use approval, legal approval of the
  interaction, target support statement, security review and green release evidence on the protected commit.
- Issue #6 remains open independently at chart 0.7.0 / oCIS 7.1.4 and cannot be closed by the release flow.
