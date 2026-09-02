# Ownership and RACI

Named GitHub accounts or teams replace role names only after they accept the responsibility. Until
then, `@amamus` is the interim accountable CODEOWNER and the relevant launch gate remains open.

## GitHub Team Assignments

| Team | GitHub Handle | Responsibility |
| --- | --- | --- |
| ownCloud Infrastructure | @owncloud/infrastructure | DNS, TLS, production hosting |
| ownCloud Brand | @owncloud/brand | Logo, trademark, brand guidelines |
| ownCloud Legal | @owncloud/legal | EULA, licensing, compliance |
| ownCloud Product | @owncloud/product | Product ownership, support statements |
| ownCloud Documentation | @owncloud/docs | Documentation, contribution guides |
| ownCloud OSPO | @owncloud/ospo | Open source program office, governance |
| Project Maintainer (interim) | @amamus | CODEOWNER, security, CI, runtime matrix |

| Area | Responsible | Accountable | Consulted | Informed |
| --- | --- | --- | --- | --- |
| oCIS version compatibility | oCIS maintainers | Named ownCloud product owner | Installer and QA maintainers | OSPO/community |
| Helm compatibility/maturity | Chart maintainers | Named chart owner | oCIS and installer maintainers | OSPO/community |
| Compose/Podman adapters | Installer maintainers | Deployment-hub maintainer | oCIS maintainers/security | Community |
| Ansible/Argo CD wrappers | Integration maintainers | Deployment-hub maintainer | Native renderer owner | Community |
| UI, CLI and CI behavior | Web/installer maintainers | Deployment-hub maintainer | Accessibility/security reviewers | Community |
| Licensing/governance | OSPO | VP OSPO or delegate | Legal and maintainers | Contributors |
| Trademark/logo | Brand owner | ownCloud/Kiteworks brand approver | OSPO/legal | Maintainers |
| EULA wording | Joint ownCloud/Kiteworks legal | Named legal approver | OSPO/product/security | Maintainers |
| DNS `get.owncloud.com` | ownCloud infrastructure | Named infrastructure owner | Security/release maintainers | Product |
| SBOM/attestation | Release/security maintainer | Named security owner | OSPO/product | Users |
| Release approval | Project maintainers | ownCloud product owner | Security, legal, support | Community |

Private review means named collaborators with repository access. Public community review begins only
after the repository-publication gate passes; communications must not blur those two states.
