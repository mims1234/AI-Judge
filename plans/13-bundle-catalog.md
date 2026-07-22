# 13 — Bundle Catalog & Naming

## Purpose and Scope

Inventories every prompt bundle the lab ships, defines purpose-first **instrument** naming, and records versioning vs leaderboards.

Out of scope: prompt bytes (owned by plan 02 / plan 14), validator logic (`plans/06-scoring-judging.md`).

---

## 1. Live inventory

### 1.1 Octant — `mini-benchmark-v1`

| Field | Value |
|---|---|
| Instrument title | **Octant** (general 8-facet capability) |
| DB `name` | `mini-benchmark` |
| `version` | `1.0.0` |
| `slug` | `mini-benchmark-v1` (**frozen**) |
| `status` | `published` |
| Source | `plans/02-seed-bundle.md` → `lib/bundles/mini-v1.ts` |
| Migration | `002_seed_mini_benchmark_v1` |
| Content hash | `1e48022acec0490191d61ffba3a1772a2700f07a521f92d17d58e2be1123fbdd` |

### 1.2 Keel — `keel-v1` (NEW)

| Field | Value |
|---|---|
| Instrument title | **Keel** (engineering depth) |
| DB `name` | `keel` |
| `version` | `1.0.0` |
| `slug` | `keel-v1` |
| `status` | `published` |
| Source | `plans/14-keel-bundle.md` → `lib/bundles/keel-v1.ts` |
| Migration | `003_seed_keel_v1` |
| Content hash | `44138b368f323c638c5d313c8d838c5ae57d29e32091ed9ac06b6ad6476be4f5` |

Both packs use all eight categories at weight 1.0. Math ground truth remains **552 / 432** (validator pin). Leaderboards are scoped per `bundle_id` and do not mix.

`getDefaultBundle()` prefers Octant (`mini-benchmark-v1`) when published; otherwise the oldest published row. UI lists both; wizard/analytics can switch by slug.

---

## 2. Naming model

| Role | Pattern | Example |
|---|---|---|
| Instrument title | Lab-instrument noun | Octant, Keel, Stylus, Prism |
| Slug | `{instrument}-v{major}` (legacy Octant keeps `mini-benchmark-v1`) | `keel-v1` |
| Semver | Prompt revision inside a family → **new row**, never UPDATE | `1.0.0` → `1.1.0` |

### Future (not seeded)

| Instrument | Slug | Measures |
|---|---|---|
| **Stylus** | `stylus-v1` | Creative + persuasion |
| **Prism** | `prism-v1` | Judge / meta-judgment |

---

## 3. Versioning checklist

- [ ] Never edit a published bundle’s prompts in place
- [ ] New row + new hash + new leaderboard on any content change
- [ ] Runs pin `bundle_hash` at snapshot time
- [ ] Quality pins every live slug + hash

---

## Acceptance criteria

- [x] Two live published seeds: Octant + Keel
- [x] Distinct content hashes
- [x] Purpose-first names documented
- [x] Quality identity tests cover both
)
