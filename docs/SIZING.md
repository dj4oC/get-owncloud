# Sizing contract

## Input complexity

| Input | Reliability for ordinary admins | Default behavior |
| --- | --- | --- |
| Registered users | Easy/reliable | Required |
| Current stored data | Easy/reliable | Required |
| Collabora needed | Easy/reliable | Required yes/no |
| HA needed | Moderate | Conservative single/HA explanation |
| Annual growth | Moderate | Suggested range; override allowed |
| Spaces | Moderate | Default 1.5 per user |
| Preview limit | Moderate | Versioned safe default |
| Peak concurrent users | Hard/unreliable | Default 10% of registered users |
| Concurrent Collabora users | Hard/unreliable | Default 5% when selected |
| Network topology/custom integrations | Hard | Advanced section and explicit review |

The UI asks reliable inputs first and derives conservative assumptions. Advanced users can override them;
every derived value is visible in the report.

## Vocabulary

- **Minimum:** expected to start, but may degrade under real workload.
- **Recommended:** includes component floors and headroom; still not load-tested.
- **Guaranteed/certified capacity:** never used.

The 30% production headroom is initially explained as 15% background indexing/thumbnails/search, 10%
request spikes and 5% observability overhead. This is a transparent planning assumption, not an empirical
universal constant. Representative production load testing is mandatory and the warning travels with
every displayed number and generated report.

## Versioning

Formula versions use `<ocis-line>-sizing-vN` and are recorded in the profile lock/report. A rule change
requires source evidence, golden tests and an entry in `CHANGELOG.md`; it never retroactively rewrites an
existing lock.
