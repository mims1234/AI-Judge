# 06 — Validators, Scoring & Judge Calibration (`lib/scoring.ts`, `lib/validators/`)

## Purpose

Specify every deterministic validator per category (including the pinned math ground truth), how validator findings feed judge prompts and the UI checklist, the server-side score pipeline (per-judgment overall → per-task median → bundle-run macro-average → leaderboard median), judge calibration meta-scoring and rollups, and the cost-estimation math used by preflight and the live cost counter.

## Scope

- `lib/validators/common.ts`, `lib/validators/math.ts`, `lib/validators/index.ts` — pure, synchronous, deterministic checks.
- `lib/scoring.ts` — `JudgeOutputSchema` handling, `aggregateTask`, `finalizeRun`, `queryLeaderboard`, judge meta-scores, calibration, `estimateRunCost`, `estimateTaskCost`.
- Fixture set for judge calibration.

Out of scope: when validators/aggregation run (plan 05 orchestrates), wire formats (plan 03), OpenRouter pricing capture (plan 04 supplies `cost_usd` and the pricing cache).

---

## Deterministic validators

### Framework

```ts
export interface ValidatorFinding {
  validator: string;            // stable id, e.g. "math_ground_truth"
  passed: boolean;
  expected_json: string | null; // JSON of the expected value/shape (for display)
  actual_json: string | null;   // JSON of what the answer contained
  details: string;              // one human sentence, e.g. "expected free=552, got 550"
}
export function runValidators(category: Category, rawOutput: string, task: TaskSnapshot): ValidatorFinding[];
```

- Pure functions: same input → same findings; no I/O, no randomness, no model calls. Plan 05 persists each finding as a `validator_results` row.
- `TaskSnapshot` = the frozen task from `runs.parameters_json` (output_schema, token_limit, category) — validators never read live bundle tables.
- **Extraction step shared by all categories** (`common.ts extractJson`): trim; if the output is wrapped in one Markdown code fence (```json … ```), unwrap it; then attempt `JSON.parse` of the whole remainder. Fences are tolerated (models add them chronically) but any *other* prose outside the JSON object fails `no_extra_prose`. If parse fails entirely, only `json_parseable` (failed) and `no_extra_prose` (failed) are reported and the remaining structural checks are skipped as failed-by-implication with `details: "skipped: unparseable JSON"`.
- **Word counting** (`common.ts countWords`): split on Unicode whitespace, drop empty tokens; hyphenated compounds count as one word; numbers count as words. This exact rule is documented in the bundle task text so models are graded against what they were told.

### Universal validators (every category)

| id | check |
|---|---|
| `json_parseable` | output (after fence-unwrap) is a single valid JSON document |
| `required_keys` | every key in the task's `output_schema` is present |
| `key_types` | each present key matches its declared type (string / number / array / object / boolean) |
| `array_counts` | every array with an exact declared count in `output_schema` has exactly that many items |
| `no_extra_prose` | nothing outside the JSON document except the tolerated fence |

### Category-specific validators

| category | id | rule |
|---|---|---|
| poster | `poster_word_limit` | total words across all copy fields **< 65** (strictly under 65) |
| story | `story_word_range` | story body word count in **[500, 700]** inclusive |
| roleplay | `roleplay_counts` | **exactly 3** discovery questions AND **exactly 5** plan steps in their respective arrays |
| marketing | `marketing_fields` | required item counts and field presence per the task's output_schema (delegates to `array_counts`/`required_keys` with marketing's declared exact counts) |
| math | `math_ground_truth` | see below |
| coding | `coding_shape` | see below |
| research | — | universal validators only (subjective quality is the judges' job) |
| judging | — | universal validators only |

### Math ground truth (`lib/validators/math.ts`)

The ONLY correct answers, computed in code and pinned by regression test:

- **free = 552** — 600 free users − 48 converts (8% of 600) = 552.
- **paid = 432** — 400 paid − 16 churned (4% of the **original 400**; converts cannot churn in their first month) + 48 converts = 432.

```ts
export function computeMathGroundTruth(): { free: number; paid: number } {
  const startFree = 600, startPaid = 400;
  const converts = startFree * 0.08;        // 48
  const churned  = startPaid * 0.04;        // 16 — from original 400 only
  return { free: startFree - converts,      // 552
           paid: startPaid - churned + converts };  // 432
}
```

Comparison: read the answer's declared numeric fields for free/paid subscriber counts (field names per the task's output_schema); compare with **strict equality on the exact integers 552 and 432 — no rounding of intermediate values, no tolerance window**. Accept JSON numbers or pure-numeric strings (`"552"`); anything else fails with the parsed value in `actual_json`. Emit one finding per field (`math_free_count`, `math_paid_count`) plus the combined `math_ground_truth` (passes iff both pass). No other derivation of these numbers is permitted anywhere in the codebase.

### Coding — shape validation only (v1)

**No code execution anywhere** (no `eval`, no `node:vm`, no worker threads — per the master plan these are not security boundaries; an executable verifier is future work in an isolated container). Checks, all static string/AST-free regex analysis of the code field:

| id | rule |
|---|---|
| `coding_function_present` | the requested function name appears as a definition (`function <name>` / `const <name> =` / `def <name>` per task language) |
| `coding_test_count` | **≥ 5** distinct test cases detected (occurrences of the task's stated test convention, e.g. `test(`/`it(`/`assert`) |
| `coding_no_forbidden_imports` | no import/require of forbidden modules listed in the task snapshot (e.g. `fs`, `child_process`, `net`, `http`, external packages when the task says stdlib-only) |

### Validator findings → judges (trusted context)

Plan 05 injects a rendered block into every judge prompt, and the UI shows the same data as a checklist beside judge feedback (objective facts stay explicit, never blended silently into scores):

```
DETERMINISTIC VALIDATION RESULTS (trusted, computed by the harness — treat as ground truth):
- [PASS] json_parseable
- [FAIL] math_ground_truth — expected free=552, got 550
...
Do not re-litigate these facts. Factor them into correctness and requirement_compliance.
```

Rendering function `renderValidatorBlock(findings)` lives in `lib/scoring.ts` so engine and tests share it.

---

## Judge output & server-side overall

### `JudgeOutputSchema` (Zod, in `lib/schemas.ts`)

Exactly the seeded bundle's extended rubric shape (`plans/02-seed-bundle.md` §4.2): `scores.{correctness, requirement_compliance, quality, honesty}` each number 0–10; `overall_score` number 0–10; `verdict` enum `pass | partial_pass | fail`; string arrays `what_was_good`, `what_was_terrible`, `what_was_missing`, `constraint_violations`, `critical_errors`, `specific_evidence`; string `one_best_improvement`. Coercion: numeric strings coerced to numbers; scores clamped-rejected (out-of-range fails validation → triggers plan 05's schema retry, not silent clamping).

### Server-computed overall

For every final parsed judgment:

- `computed_overall = mean(correctness, requirement_compliance, quality, honesty)`, kept at full float precision (round only for display).
- The judge's own `overall_score` is stored as `claimed_overall` **and never used for ranking**.
- `claim_mismatch = |claimed_overall − computed_overall|`. This feeds the judge's meta-score (below); a large mismatch lowers the judge's meta-rating, not the candidate's score.

---

## Aggregation pipeline

All derived rows are **immutable once written** (recomputed only by task retry, which deletes-then-rewrites, per plan 03 §7). Rankings are always computed from these immutable tables, never a mutable materialized leaderboard.

### 1. Per task_result → `task_scores` (`aggregateTask(taskResultId)`)

- Inputs: the 3 final judgments (plan 05 guarantees exactly 3 with `parse_status` ok/repaired, else the task is `error`).
- `median_overall = median(computed_overall₁..₃)` (middle value of the sorted three).
- `disagreement = max(computed_overall) − min(computed_overall)`.
- `flagged = disagreement > 3` (the "judges disagreed, read this one yourself" UI flag) — **derived, not stored**: recomputed from `disagreement` wherever needed (SSE payloads, UI).
- Row per `plans/01-database.md` §3.11: `(id, task_result_id, run_id, task_id, category, candidate_model_id, trial_index, judgment_ids_json, judge_overalls_json, median_overall, disagreement, validators_passed, validators_total, created_at)`.

### 2. Trials → per-(candidate × category) score

Within a run: `category_score = median(median_overall over trial_index 0..n−1)`. With the default single trial this is the trial's own median. Even-count median = mean of the two middle values. If **any** trial of the pair is `error`, the pair is incomplete → the run cannot be `completed` (plan 05's terminal rule already enforces this).

### 3. Run → `bundle_run_scores` (`finalizeRun(runId)`)

- `complete = 1` iff run status is `completed` (every task_result scored).
- Per candidate: `overall_score = mean(category_score over the run's included categories)` — **equal-weight macro-average of the 8 category medians** (every category counts the same regardless of trial counts or token sizes). If the run included fewer than all 8 categories, the score is stored but `complete = 0` — only full-bundle runs are leaderboard-eligible.
- Row per candidate, columns per `plans/01-database.md` §3.12: `(id, run_id, bundle_id, candidate_model_id, complete, category_scores_json, overall_score, total_cost_usd, avg_latency_ms, created_at)`. Cancelled/incomplete runs write rows with `complete = 0` and `overall_score = NULL` (audit trail without leaderboard impact). The bundle hash is not duplicated on this row — it comes from `runs.bundle_hash` via join when needed.

### 4. Leaderboard (`queryLeaderboard(bundleId, category?)`)

- Population per model: all `bundle_run_scores` rows with this `bundle_id` and `complete = 1`. (Bundles are immutable, so one `bundle_id` maps to exactly one `content_hash`; a re-seeded bundle is a new `bundle_id` and therefore a different leaderboard — verify via `runs.bundle_hash` if paranoia demands.)
- `score = median(overall_score over those runs)` — repeated-run median, robust to one bad run.
- `provisional = complete_runs < 3` (displayed but badged; sorted normally).
- Category mode: same population, but rank by `median(category_score)` for the requested category.
- Ancillary columns (plan 03 §8 response): `disagreement_mean` = mean of task-level disagreement across the runs; `success_rate` = scored ÷ attempted task_results; `avg_cost_usd_per_run`; `avg_latency_ms` (mean candidate latency); `last_evaluated_at`.

---

## Judge calibration

### Per-judgment meta-score (0–10), stored on the final judgment attempt

Computed by `judgeMetaScore(attempt, findings)` immediately after `aggregateTask`:

| component | weight | scoring |
|---|---|---|
| parse quality | 0.25 | `first_try` = 10; `repaired` = 5; substituted-away (this judge's slot replaced for invalid JSON) = 0 |
| evidence quality | 0.30 | fraction of feedback bullets (good/terrible/missing/violations/critical) that quote or concretely reference the candidate answer (substring ≥ 12 chars appearing in the answer, or an explicit validator-finding reference) × 10; correctly acknowledging failed validator findings (mentioning a failed validator's subject in `constraint_violations`/`critical_errors`) adds up to +2, capped at 10 |
| feedback concreteness | 0.25 | all three of good/terrible/missing non-empty **and** no bullet under 4 words = 10; each empty-or-fluff category −3.3 |
| claimed-vs-computed consistency | 0.20 | `10 − 2.5 × claim_mismatch`, floored at 0 (mismatch ≥ 4 points → 0) |

`meta_score = Σ weight × component`, full precision. Heuristics are deliberately simple, deterministic, and unit-testable; they measure *judging craft*, never agreement with the other judges' scores.

### Rollups (per judge model, per bundle — computed live for `/judges`)

- **harshness/leniency offset** = mean over judgments of `(computed_overall − panel_median_for_that_task)`; negative = harsh, positive = lenient.
- **variance** = variance of that same offset distribution.
- **parse-fail rate** = judgments requiring repair or replacement ÷ total dispatched.
- **mean meta-score**, **mean claim_mismatch**, **substitution count** (times replaced / times used as reserve).
- **Agreement is only a minor diagnostic**: display the offset/variance, but no penalty is ever applied to a judgment merely for being a well-supported minority; disagreement affects nothing except the per-task `flagged` bit and these descriptive stats.

### Fixture calibration (`judge_calibration_results`)

A small human-reviewed fixture set ships in-repo: `lib/fixtures/calibration/*.json`, ~8–12 fixtures, each = `{ id, category, task_snapshot, candidate_answer, validator_findings, human: { expected_verdict, expected_overall_range: [lo, hi], must_flag: string[] } }` covering: one perfect answer, one subtle-error answer per objective category (math off-by-rounding, poster 66 words, roleplay 4 questions), one confident-but-wrong answer, one empty-fluff answer. A maintenance action (`/judges` page button → API route calling `runCalibration(judgeModelId)`) sends each fixture through the real judge pipeline (blind, temperature 0, structured outputs) and writes `judge_calibration_results` rows: `(fixture, judge_model_id, evidence_quality, consistency, correctness, parse_status)` where `correctness` = 10 if verdict matches and computed_overall lies in the human range, scaled down by distance otherwise; `must_flag` items missing from the judgment's violation/critical lists deduct proportionally. Calibration cost is real OpenRouter spend; the UI shows an estimate before running.

---

## Cost estimation

Single source of truth: `estimateRunCost(config)` (preflight) and `estimateTaskCost(task, candidate, judges)` (engine budget gate), both in `lib/scoring.ts`, both reading pricing exclusively from `models_cache` via plan 04's `getCachedModel`.

Token estimation:

- `estTokens(text) = ceil(chars / 4)` — the standing approximation; used for prompts we possess verbatim (wrapper, task_body, judge rubric).
- Candidate call: `prompt = estTokens(wrapper + task_body)`; `completion_expected = 0.6 × token_limit`, `completion_max = token_limit`.
- Judge call: `prompt = estTokens(judge_rubric + wrapper + task_body + validator_block) + completion_expected_of_candidate` (the answer is in the judge prompt); `completion_expected = 700`, `completion_max = 1536`.
- Cost per call: `prompt_tokens × prompt_usd_per_m / 1e6 + completion_tokens × completion_usd_per_m / 1e6`. Unpriced models (null pricing) contribute 0 and set an `unpriced_models: string[]` field on the estimate so preflight can warn.

Roll-up for `PreflightResponseSchema.estimate` (plan 03 §2):

- `candidate_requests = candidates × categories × trials`; `judge_requests = 3 × candidate_requests`; `request_count` = sum. Retries and reserve substitutions are covered by the max bound, not the expected value.
- `cost_usd_expected` = Σ expected-completion costs; `cost_usd_min` = Σ with `0.25 × token_limit` completions; `cost_usd_max` = `1.35 ×` Σ with max completions (35% headroom for retries/repair attempts/substitutions).
- `duration_est_seconds` = `candidate_requests × 35s / candidate_concurrency + judge_waves × 20s` (judge waves = candidate_requests, judges parallel within a wave) — coarse, labeled an estimate.

Live cost counter: plan 05 increments `runs.total_cost_usd` transactionally from every `streamChat` result's `usage.cost_usd` (actuals from OpenRouter, falling back to pricing-cache math when usage was missing, per plan 04); `run.cost` events carry `totalCostUsd` after every billable call so the UI counter never needs client-side math.

---

## Files to implement

- `lib/validators/common.ts` — `extractJson`, `countWords`, universal validators, word-limit/count validators (poster, story, roleplay, marketing), coding shape checks.
- `lib/validators/math.ts` — `computeMathGroundTruth` (552/432), numeric-field comparison.
- `lib/validators/index.ts` — `runValidators(category, rawOutput, task)` dispatch table.
- `lib/scoring.ts` — `renderValidatorBlock`, computed-overall helpers, `aggregateTask`, `finalizeRun`, `queryLeaderboard`, `judgeMetaScore`, judge rollup queries, `runCalibration`, `estimateRunCost`, `estimateTaskCost`.
- `lib/fixtures/calibration/*.json` — the human-reviewed fixture set.
- `lib/schemas.ts` (shared) — `JudgeOutputSchema`, finding/score row schemas.

## Contracts with other modules

- **plan 05 (run engine)**: calls `runValidators` in the validating phase, `renderValidatorBlock` when assembling judge prompts, `aggregateTask` after the third final judgment, `finalizeRun` at terminal transition, `estimateTaskCost` in the budget gate. Guarantees this module receives exactly 3 valid final judgments per scored task and persists all attempts it needs for meta-scores.
- **plan 04 (OpenRouter)**: pricing via `getCachedModel`; actual `cost_usd` per call originates there. `runCalibration` uses `streamChat` through the engine's judge pipeline helpers.
- **plan 03 (API)**: `queryLeaderboard` backs `GET /api/leaderboard`; `estimateRunCost` backs preflight; `task_scores`/`bundle_run_scores` rows back the run snapshot, export, and `run.complete`/`task.scored` payload fields; `flagged` uses the same `> 3` threshold the UI documents.
- **plans 00–02**: DDL for `validator_results`, `task_scores`, `bundle_run_scores`, `judge_calibration_results` and their indexes (bundle, model, category, run status, timestamps).
- **plans 07–12 (UI)**: ValidatorPanel renders `ValidatorFinding[]` verbatim; `/judges` renders the rollups; leaderboard renders `queryLeaderboard` rows.

## Acceptance criteria

- [ ] All validators are pure/deterministic; identical inputs produce identical findings (property test with repeated invocation).
- [ ] Universal chain (parseable, required keys, types, exact array counts, no extra prose) runs for all 8 categories; fence-wrapped JSON tolerated, any other prose fails.
- [ ] Poster fails at ≥ 65 words and passes at 64; story passes exactly at 500 and 700 and fails at 499/701; roleplay requires exactly 3 questions and exactly 5 steps (2/4 and 4/6 fail).
- [ ] `computeMathGroundTruth()` returns exactly `{ free: 552, paid: 432 }` (pinned regression test); comparison is strict integer equality with no tolerance; numeric strings accepted; these values are derived nowhere else.
- [ ] Coding validators are purely static (repo-wide grep proves no `eval`/`new Function`/`node:vm` on model output): function presence, ≥ 5 tests, forbidden-import detection.
- [ ] `renderValidatorBlock` output is injected into judge prompts as trusted context and the identical findings back the UI checklist.
- [ ] `computed_overall` = mean of the four sub-scores at full precision; `claimed_overall` stored but never ranked on; `claim_mismatch` feeds only the judge meta-score.
- [ ] `aggregateTask`: median of the 3 computed overalls, `disagreement = max − min`, `flagged` iff > 3.
- [ ] Trials collapse by median; bundle-run score = equal-weight macro-average of category medians; partial-category runs are never `complete = 1`.
- [ ] Leaderboard: median of complete bundle-run scores scoped to exact `bundle_hash`; `provisional` under 3 complete runs; incomplete/cancelled runs contribute nothing.
- [ ] Judge meta-score implements the four weighted components exactly; rollups (offset, variance, parse-fail rate) match hand-computed fixtures; agreement is descriptive only — no score penalty for minority judgments.
- [ ] Calibration fixtures exist with human ranges; `runCalibration` writes `judge_calibration_results` per the scoring rules.
- [ ] `estimateRunCost` reproduces the documented formulas (unit test with a fake pricing cache); min ≤ expected ≤ max always; unpriced models surfaced; `estimateTaskCost` used by the engine's budget gate matches the same math.
- [ ] Vitest suite covers every checkbox above plus golden-file tests for `renderValidatorBlock`.
