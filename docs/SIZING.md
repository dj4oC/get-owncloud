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

## Evidence and calculation rules

| Component | Versioned rule | Evidence boundary |
| --- | --- | --- |
| oCIS base | 2 CPU, 4 GiB RAM, 5 GiB service disk | The pinned 8.2 prerequisites recommend a multicore CPU and at least 4 GiB RAM for more intensive testing; the production Compose guide recommends 4–6 GiB. oCIS does not publish a universal production CPU/RAM capacity formula. |
| Spaces cache | 5 KiB RAM per expected space | The pinned 8.2 prerequisites document 4 KiB root cache plus 1 KiB stat cache per space. |
| Collabora | At least 2 CPU; 1 GiB plus 100 MiB per concurrent editor; 100 kbit/s per editor; cross-check at 10 editors per CPU thread | The Collabora-maintained `richdocumentscode` requirements provide the CPU, RAM and network floors. The 2 GiB service-disk allowance is a conservative container/image planning value, not a vendor capacity guarantee. |
| ClamAV | 1 CPU, minimum 3 GiB and recommended 4 GiB RAM, 5 GiB free disk | The official ClamAV documentation publishes these floors and warns that database reloads can briefly consume roughly twice the engine memory. |
| Search/extraction | +1 CPU, +2 GiB RAM, index disk estimated at 10% of stored data capped at 100 GiB | A deliberately conservative project planning assumption pending workload-specific measurement; it is shown as such in every report. |

Sources are pinned in `catalog/sources.lock.json`. The project’s embedded-IDM maximum of **20 registered
users** is intentionally stricter than the upstream documentation and is enforced as deployment policy,
not presented as an upstream capacity limit.

The calculator adds stored data and one year of configured growth to service disk, applies at least 30%
headroom to the recommendation, and compares entered host CPU/RAM/disk against both the calculated
minimum and recommendation. Bundled Collabora and ClamAV therefore visibly increase the result.

## Headroom Documentation

The 30% production headroom is a **mandatory minimum** and is composed of:

| Component | Allocation | Rationale |
| --- | --- | --- |
| Background indexing | 15% | oCIS background jobs: thumbnail generation, search indexing, metadata extraction |
| Request spikes | 10% | Peak concurrent user bursts and API request surges |
| Observability overhead | 5% | Metrics, logging, tracing, and monitoring agent resource usage |

**Important**: This is a transparent planning assumption, **not** an empirical universal constant. Every
sizing report explicitly states: "Representative production load testing is mandatory." The headroom:

- Is **never waived** for production deployments
- Can be **increased** by users for specific workload requirements
- Is **conservative by design** - real workloads may require more
- Travels with every displayed number and generated report as a visible warning

Headroom is applied **after** all component requirements are summed, ensuring compound resource
effects (Collabora + ClamAV + Search) are properly accounted for. The formula is:

```
recommended_resources = (sum_of_component_requirements) * 1.30
```

If the calculated recommendation exceeds available host resources, the generator emits a
blocking error with the specific deficit clearly identified.

## Versioning

Formula versions use `<ocis-line>-sizing-vN` and are recorded in the profile lock/report. A rule change
requires source evidence, golden tests and an entry in `CHANGELOG.md`; it never retroactively rewrites an
existing lock.
