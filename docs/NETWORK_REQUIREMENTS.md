# Network requirements

Part 1 reports requirements; it never edits firewall or DNS configuration.

| Direction | Destination | Purpose | Required when |
| --- | --- | --- | --- |
| Outbound TCP 443 | Approved package/image/chart repositories | Signed metadata, packages and images | Tool install or deployment |
| Outbound UDP/TCP 53 | Configured resolver | DNS | Always unless names are pre-resolved |
| Outbound TCP 443 | ACME endpoint | Certificate issuance | ACME selected |
| Outbound TCP 443 | SMTP/OIDC/S3/Collabora endpoints | Selected external integrations | Corresponding feature selected |
| Host/ingress TCP 443 | Deployment endpoint | User access | Production |
| Host TCP 9200 | Local evaluation endpoint | Default unprivileged evaluation | Evaluation default |

HTTP(S) proxy variables are detected, redacted in reports and forwarded only to approved download tools.
Custom CA bundles must be explicitly supplied. TLS verification cannot be disabled for production.
NFS should use an unrouted switched network at Gigabit or better; only NFSv4.2 is permitted.
