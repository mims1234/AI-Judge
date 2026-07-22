# 14 — Seed Bundle: `keel-v1` (Keel)

## Purpose and Scope

Canonical source for the **Keel** instrument — an engineering-depth prompt pack distinct from Octant (`mini-benchmark-v1`). Implementation: `lib/bundles/keel-v1.ts`, seeded by migration `003_seed_keel_v1`.

Keel keeps the same 8 categories and validator-compatible output schemas (math 552/432 field pins, roleplay 3×5 counts, `createIdempotencyGuard`, poster &lt;65 words, story 500–700) so existing `lib/validators/*` continue to work without Backend changes. Task *narratives* are new.

Naming / catalog: `plans/13-bundle-catalog.md`.

---

## 1. Bundle metadata

| Field | Value |
|---|---|
| Instrument title | **Keel** |
| `name` | `keel` |
| `version` | `1.0.0` |
| `slug` | `keel-v1` |
| `status` | `published` (immutable) |
| Categories | same 8 as Octant, weight 1.0 each |
| `content_hash` | `44138b368f323c638c5d313c8d838c5ae57d29e32091ed9ac06b6ad6476be4f5` |
| `changelog` | Keel v1 — engineering-depth instrument (SRE triage, worker idempotency, tenant math, storage migration, Keelwatch launch, failure-Friday poster, autoscaler story, empty-catch judging) |

Prompt bodies live verbatim in `lib/bundles/keel-v1.ts` (`TASK_BODIES`). Wrapper + extended judge prompt are shared with Octant (`WRAPPER`, `JUDGE_PROMPT` from `mini-v1.ts`).

---

## 2. What Keel measures

Engineering judgment under pressure: SRE triage, concurrency/idempotency, capacity math, storage migration trade-offs, technical product messaging, concise ops communications, systems-flavored narrative, and secure coding judgment.

Leaderboards for `keel-v1` are independent of `mini-benchmark-v1`.

---

## 3. Files

| File | Role |
|---|---|
| `lib/bundles/keel-v1.ts` | Bundle object + `keelContentHash()` |
| `lib/db.ts` migration 003 | Inserts one `bundles` row + 8 `tasks` |
| `tests/unit/bundle-identity.test.ts` | Pins both Octant and Keel hashes/slugs |

---

## Acceptance criteria

- [x] Second published bundle slug `keel-v1` with 8 tasks
- [x] Content hash ≠ Octant hash
- [x] Migration append-only (`003_seed_keel_v1`)
- [x] Validators still apply (shared schema shapes)
)
