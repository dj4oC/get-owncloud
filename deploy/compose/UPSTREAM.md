# Curated oCIS full bundle

The templates are a policy-restricted derivative of the official
[ocis_full](https://github.com/owncloud/ocis/tree/v8.2.0/deployments/examples/ocis_full)
example at commit 42f7fdcfee2714cb14eedb36509f74ef205703f9.

The renderer retains the official Traefik, oCIS, Tika, Collabora, ClamAV and s3ng service model while:

- pinning every container to a multi-architecture manifest digest;
- limiting office integration to Collabora;
- limiting storage drivers to standard ocis or s3ng;
- using persistent bind paths so backup and restore are explicit;
- adding production preflight, EULA, resource and NFSv4.2 gates.

No experimental storage overlay or unsupported integration is copied into the distributable template set.
The source lock records the upstream and derivative source versions.
