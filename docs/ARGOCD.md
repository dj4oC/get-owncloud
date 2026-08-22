# Argo CD contract

V1 installs/detects the pinned Argo CD CLI only and requires an existing compatible controller. Controller
bootstrap remains in the full roadmap but needs its own separately reviewed cluster-wide security adapter;
it is not hidden or silently attempted.

V1 emits one `Application` for the one chart/release. App-of-apps activates only when independently
synced child releases have a demonstrated need.

## RBAC

- The generator never creates cluster-admin credentials.
- The project/namespace and allowed repositories/destinations are explicit.
- The controller service account receives only verbs/resources required by rendered output.
- Existing cluster policy remains authoritative; missing permission blocks sync with a diagnostic.

## Updates

Updates are proposed as GitHub pull requests changing the lock and generated values. Every change requires
manual review; breaking changes cannot auto-sync. Direct Helm and Argo CD rendering run on every profile or
lock change and must normalize to equivalent manifests.
