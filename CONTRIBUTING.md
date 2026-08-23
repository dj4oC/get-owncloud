# Contributing

This repository is private during the initial RFC and safety review. External reviewers must be added
as named collaborators; private visibility must never be described as open community participation.
The repository becomes public only after the publication gate in `docs/LAUNCH_GATES.md` is met.

## Catalogue changes

Every option needs a source, version, target mapping, maturity, resource effect, dependency/conflict
rules and positive plus negative tests. New upstream options default to denied. Experimental options
may be represented as metadata for drift detection but cannot be selected, imported or rendered.

See [docs/CATALOGUE_MAINTENANCE.md](docs/CATALOGUE_MAINTENANCE.md) for the authority matrix and review flow.

## Stewardship

- ownCloud/oCIS and chart maintainers approve version compatibility and production-support statements.
- The ownCloud/Kiteworks OSPO stewards licensing, governance, contribution policy and trademark routing.
- Joint legal reviewers approve the EULA acknowledgement because the experience is co-branded.
- Installer maintainers own CLI, UI, adapter behavior and CI evidence.
- Security approval covers bootstrap provenance, privilege behavior, SBOM and attestations.

Current path ownership is routed to `@amamus` until verified maintainer usernames or teams accept each
role. Placeholder GitHub usernames are deliberately not used in CODEOWNERS.

## Pull requests

1. Link the RFC issue and identify the affected source/version.
2. Add or update tests, including a negative test for policy changes.
3. Run `npm run verify`.
4. Do not commit generated secrets or local EULA audit logs.
5. Use DCO sign-off when the repository policy enables public contributions.
