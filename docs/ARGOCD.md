# Argo CD contract

V1 installs/detects the pinned Argo CD CLI only and requires an existing compatible controller. Controller
bootstrap remains in the full roadmap but needs its own separately reviewed cluster-wide security adapter;
it is not hidden or silently attempted.

V1 emits one `Application` for the one chart/release. App-of-apps activates only when independently
synced child releases have a demonstrated need.

## RBAC

- The generator never creates cluster-admin credentials.
- The project/namespace and allowed repositories/destinations are explicit.
- The AppProject denies cluster-scoped resources and enumerates the namespace-scoped kinds emitted by
  the pinned chart; it contains no wildcard resource grant.
- The `owncloud` namespace must be pre-created. The Application cannot create namespaces or silently
  expand the existing controller service account.
- Before dry-run or mutation, deployment verifies both Argo CRDs, the `argocd-server` rollout, the CLI,
  and the caller's ability to create `Application` and `AppProject` resources. Any missing readiness or
  authorization signal stops with a targeted diagnostic.
- The existing controller service account receives only the verbs/resources required by the rendered
  output through operator-owned Argo CD RBAC; missing permission blocks sync with a diagnostic.
- Existing cluster policy remains authoritative; missing permission blocks sync with a diagnostic.

## Updates

Updates are proposed as GitHub pull requests changing the lock and generated values. Every change requires
manual review; breaking changes cannot auto-sync. Direct Helm and Argo CD rendering run on every profile or
lock change and must normalize to equivalent manifests.
