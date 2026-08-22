# Redirect and documentation plan

The final redirects are proposed upstream after production launch approval; this repository does not
silently modify ownCloud documentation.

| Source | Destination anchor | Purpose |
| --- | --- | --- |
| oCIS deployment overview | `https://get.owncloud.com/#methods` | Choose deployment family |
| oCIS prerequisites | `https://get.owncloud.com/#sizing` | Evaluate system requirements |
| oCIS storage docs | `https://get.owncloud.com/#storage-policy` | Explain supported storage choices |
| `ocis_full` README | `https://get.owncloud.com/#docker` | Configured Compose path |
| ocis-charts README | `https://get.owncloud.com/#kubernetes` | Helm/Argo maturity and generator |

Redirects must preserve useful anchors, avoid redirect loops and retain direct links back to the exact
versioned upstream source. CI checks all destinations before launch.
