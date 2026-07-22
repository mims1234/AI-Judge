# 11 — Testing & Verification Plan

## Purpose

Define the complete, implementable test strategy for AI Judge: what is tested, at which layer (Vitest unit, Vitest integration with fixtures, Playwright end-to-end), with which fixtures, and what "done" means. This file is the executable form of the master plan's **Verification** section:

> Unit tests for panel fairness/self-exclusion, median/disagreement, validators, eligibility, costs, retries, and idempotency. Integration fixtures for OpenRouter stream parsing, malformed judge JSON, replacement judges, cancellation, reconnection, and transaction recovery. End-to-end flow: configure → preflight → run → reconnect → report → leaderboard → export. Accessibility checks for setup, workbench, dialogs, tables, and status updates. Manual smoke run with inexpensive models and a strict spending cap.

## Scope

**In scope:**

- Vitest unit tests for pure logic in `lib/` (scoring, validators, panel selection, eligibility, cost estimation, retry policy, idempotency hashing).
- Vitest integration tests that exercise `lib/openrouter.ts`, `lib/run-engine.ts`, and `lib/db.ts` together against a **local mock OpenRouter server** and a **temp-file SQLite database** — no real network calls, no real API key.
- Playwright end-to-end tests of the full browser flow against `next dev`/`next start` with OpenRouter mocked at the HTTP layer.
- Accessibility (keyboard, focus, announcements, reduced motion) and responsive checks inside Playwright.
- The fixture library that all of the above share.
- A manual smoke-run checklist for one real (cheap, capped) OpenRouter run.

**Out of scope:**

- Executing model-generated code (explicitly forbidden in v1 — the Coding validator is shape-only).
- Load/perf benchmarking beyond the basic timing assertions listed below.
- Testing OpenRouter's actual service behavior; we test only our client's handling of documented/observed response shapes captured as fixtures.
- Visual regression screenshots (may be added later; not required for v1 acceptance).

## Tooling & layout

- **Vitest** (`vitest` + `@vitest/coverage-v8`), environment `node` for `lib/` tests. Config: `vitest.config.ts` at repo root; test files match `tests/unit/**/*.test.ts` and `tests/integration/**/*.test.ts`.
- **Playwright** (`@playwright/test`), config `playwright.config.ts`; specs in `tests/e2e/*.spec.ts`; Chromium required, Firefox/WebKit optional in CI. `webServer` block boots the app with `OPENROUTER_BASE_URL` pointed at the mock server (see Integration section) and `DATABASE_PATH` pointed at a per-run temp file.
- Integration tests must never touch `./data/ai-judge.sqlite`. Every integration/e2e test creates its DB at `mkdtemp()`-style temp path and deletes it in teardown.
- npm scripts (defined in `plans/12-env-deployment.md`): `test` (Vitest run), `test:watch`, `test:e2e` (Playwright).
- Determinism rule: every test that involves randomness (panel selection) must pass an explicit seed. No test may depend on wall-clock time except via injected/faked clocks (`vi.useFakeTimers()` for backoff tests).

---

## 1. Vitest unit tests

### 1.1 Seeded panel fairness & self-exclusion — `tests/unit/panel-selection.test.ts`

Tests target the pure function in `lib/run-engine.ts` (or a `lib/panels.ts` extraction) with signature approximately:

```ts
selectPanel(judgePool: string[], seed: string | number, category: string): {
  panel: [string, string, string];
  reserves: string[];        // remaining pool in deterministic seeded order
}
resolvePanelForCandidate(panelSelection, candidateModelId): {
  effectivePanel: [string, string, string];
  substitutions: Array<{ excluded: string; replacement: string }>;
}
```

Cases:

1. **Determinism** — same `(pool, seed, category)` returns an identical panel and identical reserve ordering across 100 invocations and across process restarts (assert against a stored golden value, not just self-consistency).
2. **Seed sensitivity** — different seeds over the same pool produce different panels with high probability (assert at least one difference across 20 seeds; do not assert all differ).
3. **Category independence** — the same seed with different category names yields independently derived panels (category must be mixed into the derivation, e.g. `hash(seed + category)`).
4. **Shared panel per category** — one panel selection is made per `(run, category)` and reused for every candidate; the function must not take candidate ID as an input to base selection.
5. **Fairness sanity** — over 2,000 random seeds with a 6-model pool, every pool member appears in panels within ±20% of the expected frequency (3/6 = 50%). This is a smoke test for bias, not a rigorous statistical test.
6. **Self-exclusion substitution** — when the candidate model is on the panel, `resolvePanelForCandidate` swaps it for the **first seeded reserve**, only for that candidate, and reports the substitution `{excluded, replacement}`. The other two panel members are unchanged and keep their positions.
7. **Multiple exclusions** — candidate appears on panel AND the first reserve equals the candidate (edge: pool contains duplicates is invalid input — Zod rejects upstream; but test that when reserve #1 was already consumed by a previous substitution rule within the same resolution, reserve #2 is used).
8. **Insufficient pool** — pool of size < 3 throws a typed error (`PanelSelectionError`); pool of exactly 3 with a self-judging candidate and zero reserves throws (preflight must have caught this — engine still refuses).
9. **Substitution recording contract** — the returned substitution record matches the shape persisted to `category_judge_panels` / run metadata (excluded judge, replacement judge, candidate, category), so the report UI can render "judge X was swapped for Y on its own answers".

### 1.2 Median & disagreement math — `tests/unit/scoring.test.ts`

Targets `lib/scoring.ts`:

1. `median([a,b,c])` — odd count returns middle value; test with unsorted input, duplicates, floats (`[7, 3, 5]` → 5; `[4, 4, 9]` → 4; `[6.5, 6.5, 6.5]` → 6.5).
2. `median` over trials — even count (2 trials) returns arithmetic mean of the two middle values (`[6, 7]` → 6.5). Task score = median across trials per master plan.
3. `disagreement([a,b,c])` = max − min (`[3, 9, 5]` → 6; all equal → 0). Disagreement > 3 sets the `flagged` boolean used by the arena/report UI.
4. **Server-side overall** — official overall = mean of the four sub-scores (correctness, requirement_compliance, quality, honesty), rounded only at display time. The judge's claimed `overall_score` is stored but never used in aggregation; `claim_mismatch = |claimed − computed|` feeds the calibration meta-score's consistency component (`10 − 2.5 × claim_mismatch`, floored at 0 — plan 06).
5. **Bundle-run total** — equal-weight macro-average of the 8 category medians; with one category missing the run is NOT total-scored (feeds eligibility, §1.4).
6. **Repeated-run leaderboard score** — median of complete bundle-run totals; a model with < 3 complete runs is marked `provisional: true`.
7. Precision: all aggregation is done on raw floats; assert no premature rounding (e.g. medians of `[6.33, 6.34, 6.35]` compare exactly).

### 1.3 Deterministic validators — `tests/unit/validators/*.test.ts`

One file per validator area. Each validator returns `{ validator: string; passed: boolean; expected_json: string | null; actual_json: string | null; details: string }` rows matching the `validator_results` table (plan 01 §3.9 / plan 06's `ValidatorFinding`).

`tests/unit/validators/common.test.ts` — for `lib/validators/common.ts`:

- **JSON parseability**: valid JSON passes; JSON wrapped in ``` fences passes after documented fence-stripping; leading/trailing prose around JSON fails the "forbidden extra prose" check while (if extractable) still recording the parsed payload for downstream checks; truly unparseable output fails everything downstream with a single `json_parseable` failure row (plus `no_extra_prose`, per plan 06's extraction rule).
- **Required keys / expected types**: missing key → fail with the key name in `details`; wrong type (string where number expected) → fail; extra unexpected top-level keys → fail the strict-shape check.
- **Exact array counts**: schema-declared counts are enforced exactly (e.g. a task requiring exactly 5 items fails on 4 and on 6, with expected/actual counts in the result row). Test off-by-one both directions.
- **Word-count checks**: word counting is defined as splitting on Unicode whitespace after trimming, with markdown syntax characters not stripped (document this exact rule in the validator and test it): **Poster < 65 words** — 64 passes, 65 fails, 66 fails; **Story 500–700 words** — 499 fails, 500 passes, 700 passes, 701 fails. Include a fixture with multiple consecutive spaces and newlines to lock in the tokenization rule.
- **Roleplay & Marketing**: required item counts and field presence per the seeded bundle's schemas (exact counts come from `lib/bundles/mini-v1.ts`; tests import the bundle definition rather than hard-coding, plus one hard-coded assertion each so a silent bundle edit breaks a test).

`tests/unit/validators/math.test.ts` — for `lib/validators/math.ts`:

- The validator computes ground truth in code: free = 600 − 48 = **552**; paid = 400 − 16 (4% churn of the original 400 — converts cannot churn in their first month) + 48 = **432**.
- Submitted `{free: 552, paid: 432}` passes; `{free: 552, paid: 436}` (the classic wrong answer from churning 4% of 448) fails with expected 432 / actual 436 in the row; pure-numeric strings (`"552"`) are accepted per plan 06's comparison rule, but non-numeric strings fail the type check; missing field fails presence.
- No rounding of intermediates: assert the validator compares exact integers and would catch e.g. 431.68 submitted as 432 vs a task variant demanding exactness (the seeded task's answers are integers; the test documents the exact-compare policy).

`tests/unit/validators/coding.test.ts`:

- Shape validation: requested function name present in the code string, requested tests present, obvious forbidden imports (e.g. `child_process`, `fs`, network modules per the task definition) fail.
- **Non-execution guarantee**: static assertion that the validator module never imports `node:vm`, `eval`s, or spawns — implemented as a test that reads the validator source file and greps for `eval(`, `new Function`, `node:vm`, `child_process`. Crude but effective tripwire for the v1 security rule.

`tests/unit/validators/dispatch.test.ts` — `lib/validators/index.ts` routes each of the 8 categories to the right validator set; unknown category throws.

### 1.4 Eligibility rules — `tests/unit/eligibility.test.ts`

Targets eligibility logic in `lib/scoring.ts`:

1. A task result with status `error` (timeout / 429-exhausted / provider 5xx / stream abort by infrastructure — `error.kind = 'infra_failure'`) contributes **no score** — never a zero. Assert the category median is computed only from scored trials, and if any trial of the pair errored the category cannot complete.
2. A run with any errored category is an `incomplete` bundle run (`runs.status = 'incomplete'`, `bundle_run_scores.complete = 0`): excluded from the main leaderboard, visible in run reports with an "incomplete" badge state.
3. A **validation failure or judged zero** is a real score (a model that outputs garbage gets judged low — that IS eligible); only infrastructure failure is score-neutral. Test both paths side by side to lock the distinction.
4. Cancelled runs are never leaderboard-eligible regardless of how many tasks finished.
5. Provisional flag: < 3 complete bundle runs → provisional; 3+ → established (boundary test at exactly 3).

### 1.5 Cost estimation — `tests/unit/cost.test.ts`

Targets the preflight estimator (`estimateRunCost` / `estimateTaskCost` in `lib/scoring.ts`, plan 06):

1. Estimate = Σ over (candidates × categories × trials) of [prompt tokens × prompt price + max output tokens × completion price] + Σ over (the same × 3 judges) of judge-side costs, using the pricing snapshot from `models_cache`. Test with 2 candidates × 8 categories × 1 trial × 3 judges against hand-computed totals.
2. Range semantics: estimator returns `{low, high}` (low = expected typical completion length heuristic, high = full token limit); high ≥ low always.
3. Free models (price 0) contribute 0; missing pricing for a model produces a preflight warning value, not NaN (assert no NaN/Infinity ever escapes).
4. Actual-cost accumulation: given a sequence of usage chunks (tokens + cost from final SSE chunk), the run's `total_cost_usd` sums exactly; the budget gate refuses to start the next task when `total + committedEstimate ≥ cap` and the run terminates `incomplete` with a `BUDGET_CAP_REACHED` notice (test at exactly the cap; plan 05).

### 1.6 Retry / backoff policy — `tests/unit/retry.test.ts`

Targets the retry helper used by `lib/openrouter.ts` / `lib/run-engine.ts`:

1. Retries on 429, 500, 502, 503, 529, network error, and timeout; does **not** retry on 400, 401, 403, 404 (assert single attempt).
2. Bounded attempts (default 3) then a typed `OpenRouterError` that the engine maps to task status `error` with `error.kind = 'infra_failure'` (an `incomplete`-contributing failure, never a zero score).
3. Exponential backoff with jitter: with fake timers and a seeded/injected jitter source, delays are `base × 2^attempt ± jitter` and each delay is within its documented bounds; total attempts respect a per-task deadline.
4. `Retry-After` header, when present on a 429, overrides computed backoff.
5. Judge-JSON schema retry is a *separate* policy: exactly one schema-focused re-ask after an invalid judge JSON, then reserve replacement (unit-tested here as policy state machine; full flow in integration §2.2).

### 1.7 Within-run idempotency hashing — `tests/unit/idempotency.test.ts`

1. Request hash = stable hash over `(run_id, task_id, candidate_model_id, trial_index, role[candidate|judge], judge_model_id?, attempt)` plus prompt content hash. Same inputs → same hash; any field changed → different hash.
2. Key-order independence: semantically identical request objects with differently ordered keys hash identically (canonical JSON serialization).
3. **No cross-run/cross-trial reuse**: hashes for the same task in different runs, and for different trial indices, must differ — this encodes the master plan's "idempotency without benchmark leakage" rule. A test constructs two trials of the same task and asserts distinct hashes.
4. Duplicate suppression: the engine-facing check `alreadyExecuted(hash)` returns true only for a hash recorded in the *same run*, verified with two in-memory DB rows.

---

## 2. Vitest integration tests (with fixtures)

Shared harness: `tests/integration/helpers/mock-openrouter.ts` — an in-process `node:http` server that serves:

- `GET /models` → fixture model list (~10 models with pricing, including one free model and one with missing pricing).
- `POST /chat/completions` with `stream: true` → replays a scripted SSE fixture file byte-for-byte (configurable chunk boundaries and inter-chunk delays), ending with the usage-bearing final chunk and `data: [DONE]`.
- Scriptable per-test behaviors: return 429 with `Retry-After`, return 500, hang (for timeout tests), drop the socket mid-stream, and route different responses by request body matcher (so candidate vs judge calls get different fixtures).

Shared harness: `tests/integration/helpers/test-db.ts` — creates a temp SQLite file, runs migrations, returns the `better-sqlite3` handle + path; teardown closes and deletes.

### 2.1 OpenRouter SSE stream parsing — `tests/integration/stream-parsing.test.ts`

Fixture-driven tests of `lib/openrouter.ts` streaming client against the mock server:

1. **Happy path**: multi-chunk delta stream reassembles the exact final text; usage (prompt/completion tokens, cost) is captured from the final chunk; finish_reason recorded.
2. **Chunk-boundary torture**: the same logical stream served with SSE frames split at arbitrary byte boundaries (including mid-`data:` line and mid-UTF-8 multibyte character) parses identically. Fixture generator reslices one recording at random-but-seeded offsets.
3. **Comment/keepalive lines** (`: keepalive`) and empty events are ignored.
4. **Mid-stream provider error event** (OpenRouter error JSON inside the stream) → typed error, partial text preserved on the task result, status per retry policy.
5. **Socket drop mid-stream** → treated as retryable infrastructure failure; on retry exhaustion the task ends `error` (`infra_failure`) and the run ends `incomplete` (never zero-scored) — asserts the eligibility linkage end to end.
6. **Timeout**: no bytes for the configured idle window → abort + retry path.

### 2.2 Malformed judge JSON → retry → reserve replacement — `tests/integration/judge-repair.test.ts`

Drive `lib/run-engine.ts` for a single task with a 3-judge panel against scripted judge responses:

1. Judge A returns valid JSON first try → `judgment_attempts` has 1 row, `parse_status = 'first_try'`.
2. Judge B returns prose-wrapped JSON → attempt 1 invalid (extra prose fails extraction), one schema-focused retry returns valid JSON → final attempt `parse_status = 'repaired'`, both raw attempts preserved.
3. Judge C returns unparseable output → one schema-focused retry is issued (assert the retry prompt contains the schema); retry also invalid → Judge C is replaced by the **first seeded reserve** judge, whose valid JSON becomes the third judgment. Assert: both of C's raw attempts are persisted (`parse_status = 'invalid'`), the reserve's judgment row references the reserve model, the substitution is recorded (`is_substitute`/`substituted_for`), and the task score uses [A, B, reserve] medians.
4. Reserve also fails → next reserve; pool exhausted → task marked `error` with `error.kind = 'judging_failure'` (not zero; the run ends `incomplete`).
5. Claimed-vs-computed overall mismatch fixture → calibration score reflects the penalty (links to §1.2.4).

### 2.3 Cancellation mid-stream — `tests/integration/cancellation.test.ts`

1. Start a run against a slow-streaming fixture; call the engine's cancel while the candidate stream is mid-flight. Assert: the outbound request is aborted (`AbortController` fired — mock server observes the socket close), the in-flight task keeps its last durable checkpoint (no partial text persisted, no `cancelled` task status exists — plan 05), no judge calls are issued for it, run status becomes `cancelled`, and completed tasks' scores remain persisted and readable.
2. Cancel during the judge phase: candidate answer stays persisted; incomplete judgments are discarded/marked; no partial score is written to `task_scores`.
3. Cancelled run is leaderboard-ineligible (ties to §1.4.4).

### 2.4 SSE reconnect with Last-Event-ID replay — `tests/integration/sse-reconnect.test.ts`

Tests `GET /api/runs/[id]/events` (route handler invoked directly or via `next` test server):

1. Events carry monotonically increasing `id:` fields; a client connecting with `Last-Event-ID: N` receives every event with id > N in order, then live events. Verified by connecting client #2 mid-run with client #1's last seen ID and asserting the merged sequences are identical.
2. Replay comes from the durable event log (SQLite), not memory: restart the engine's in-memory state between connections and assert replay still works.
3. Reconnect after run completion → replay up to and including the terminal `run.complete` event, then stream close.
4. Unknown run ID → 404; malformed Last-Event-ID → full replay from 0 (documented behavior).

### 2.5 SQLite transaction recovery after simulated crash — `tests/integration/crash-recovery.test.ts`

1. Run a 2-candidate × 2-category run; after task #2 fully persists (its one-transaction-per-completed-task commit), **kill the engine abruptly** (throw inside the loop / abort the process's engine object without cleanup, mid-way through task #3's streaming — before its transaction).
2. Open a fresh engine on the same DB file (simulating process restart). Assert: `runs.status` recovery marks the run resumable; resume **skips** tasks #1–2 (status-checkpointed `scored`), re-executes task #3 from scratch (its partial work either absent or superseded — no duplicate `task_results` rows for the same (task, candidate, trial) in `scored` status), and completes tasks #3–4.
3. Assert no duplicate billing hashes: re-executed task #3 gets a fresh attempt row; idempotency hash check prevents double-execution *within* the resumed run for already-scored work.
4. WAL-mode DB opened by the recovery process reads all committed rows (sanity check that persistence used transactions correctly).
5. Derived `task_scores` / `bundle_run_scores` written only once per completed unit — recount after resume equals the expected totals.

---

## 3. Playwright end-to-end — `tests/e2e/`

Environment: `playwright.config.ts` `webServer` starts the app with `OPENROUTER_BASE_URL=http://127.0.0.1:<mockPort>` (the same mock server from §2, started globally in `tests/e2e/global-setup.ts`) and a temp `DATABASE_PATH`. No real key needed; a dummy `OPENROUTER_API_KEY=test-key` satisfies boot checks.

### 3.1 Full-flow spec — `tests/e2e/full-run-flow.spec.ts`

Single serial spec covering the master plan's flow:

1. **Configure**: visit `/run`; step 1 select bundle `mini-benchmark-v1`; step 2 pick 2 candidate models via the fuzzy model picker (type-to-filter, keyboard select); step 3 pick a 4-model judge pool (assert preflight-style warning appears when a candidate is also in the pool); step 4 review screen shows request count, token estimate, cost range, and a spending-cap input.
2. **Preflight**: submit; assert preflight response renders (model availability, context checks, cost range) before the launch button enables.
3. **Run (mocked OpenRouter)**: launch; land on `/runs/[id]`; arena grid shows candidates × categories cells transitioning pending → streaming → judging → scored; click one cell → drawer opens with candidate text and 3 judge verdict cards (badge + score bars, never raw JSON); a cell scripted with disagreement > 3 shows the warning flag.
4. **Reconnect**: mid-run, `page.reload()`; assert the workbench rehydrates (completed cells scored, in-flight cell resumes streaming) — exercises snapshot + Last-Event-ID in a real browser `EventSource`.
5. **Report**: after the `run.complete` event, the page shows the completed report: category medians, disagreement flags, validator checklist beside judge feedback, substitution note if scripted.
6. **Leaderboard**: navigate to `/leaderboard`; the run's models appear scoped to the bundle; the incomplete-run model scripted in fixtures does NOT appear; provisional badge shows for < 3 runs.
7. **Export**: click JSON export and CSV export; assert downloads complete and JSON parses with the expected top-level keys per plan 03 §9 (the `RunSnapshotSchema` payload — `run`, `candidates`, `judge_pool`, `panels`, `task_results`, `bundle_run_score` — plus `export_meta` and the full `judgment_attempts` list); CSV row count matches (task_result × judge) count.

### 3.2 Control-flow spec — `tests/e2e/run-controls.spec.ts`

Pause → assert streaming halts and status announces; resume → continues; cancel (with confirm dialog) → run ends `cancelled`, report shows partial results, leaderboard unaffected. Retry a scripted-to-fail single task from the report via the per-task retry control.

### 3.3 Accessibility spec — `tests/e2e/accessibility.spec.ts`

Automated + scripted checks (install `@axe-core/playwright` for scanning):

- **Axe scans** with no serious/critical violations on: `/`, `/run` (each of the 4 steps), `/runs/[id]` live and completed, `/leaderboard`, `/compare`, `/judges`.
- **Keyboard navigation**: complete the entire 4-step run setup using only keyboard (Tab/Shift+Tab/Arrow/Enter/Escape); model picker is operable via keyboard including filter + select; arena grid cells reachable and drawer openable via Enter, closable via Escape with focus returned to the invoking cell.
- **Focus management**: opening the cell drawer moves focus into it; dialogs trap focus; step transitions move focus to the step heading.
- **Announcements**: run status changes (streaming/judging/scored/paused/finished) are announced via `aria-live` region — assert the live region's text content updates; the cost-cap stop announces.
- **Reduced motion**: with `prefers-reduced-motion: reduce` emulated, cell transition animations are disabled (assert no CSS animation/transition on cells, state still visibly changes).

### 3.4 Responsive spec — `tests/e2e/responsive.spec.ts`

At 375×812 (mobile), 768×1024 (tablet), 1440×900 (desktop): no horizontal overflow on `/`, `/run`, `/runs/[id]`, `/leaderboard`; arena grid collapses to its documented responsive summary form on mobile (per UI plan); leaderboard table provides its non-table/scrollable alternative; model picker remains usable at 375px.

---

## 4. Test fixtures strategy

All fixtures live in `tests/fixtures/`, are checked into git, and are **recorded once then hand-curated** — record real outputs from cheap models during development (via a `scripts/record-fixture.ts` helper hitting real OpenRouter with the dev key, never run in CI), scrub any identifying/provider metadata, and freeze them.

```
tests/fixtures/
  models/list.json                      # mock /models response (~10 models, pricing incl. $0 + missing)
  candidates/<category>/valid-1.txt     # per-category valid model output (one per 8 categories min.)
  candidates/<category>/valid-2.txt     # a second stylistic variant for trial-median tests
  candidates/<category>/invalid-json.txt      # broken JSON / prose contamination
  candidates/<category>/constraint-violation.txt  # e.g. poster-65-words.txt, story-499-words.txt,
                                                  # math-wrong-436.txt, wrong array counts
  judges/valid-first-try.json
  judges/prose-wrapped-repairable.txt   # JSON inside prose/fences → repaired path
  judges/invalid-both-attempts.txt      # unparseable, stays invalid after retry
  judges/schema-drift.json              # parseable but fails Zod (missing field, wrong enum)
  judges/inconsistent-overall.json      # claimed overall far from sub-score mean
  sse/candidate-stream-happy.sse        # raw SSE byte recordings replayed by mock server
  sse/candidate-stream-split-utf8.sse
  sse/stream-with-error-event.sse
  sse/judge-stream-happy.sse
  calibration/README.md                 # provenance + review notes
  calibration/cases/*.json              # human-reviewed calibration set (below)
```

Rules:

- **Candidate fixtures** exist per category in three flavors: valid, invalid-JSON, constraint-violating. Constraint-violating fixtures are purpose-built to sit exactly on validator boundaries (65-word poster, 499- and 701-word stories, math free=552/paid=436, one-item-short arrays) so unit and e2e layers share the same boundary truths.
- **Judge fixtures** cover the four parse outcomes the schema pipeline distinguishes: valid first try, repairable, invalid-after-retry, schema-drift; plus the consistency-penalty case.
- **SSE fixtures** are byte-level recordings (including chunk boundaries) so stream-parsing tests replay realistic wire data; a seeded reslicer generates boundary-torture variants at test time rather than storing dozens of files.
- **Human-reviewed calibration set** (`calibration/cases/`): 8–12 cases, each containing a task reference, a candidate answer, validator findings, and a human-authored reference judgment (scores + key evidence points). Used by `tests/unit/calibration.test.ts` to verify the judge meta-rating: a fixture judge output that cites the validator findings and gives concrete evidence scores high; an empty-fluff or validator-contradicting judgment scores low; parse status tiers (first-try > repaired > invalid) order correctly. The README records who reviewed each case and when, since these encode human judgment.
- Fixtures are the single source shared by unit, integration, and e2e layers — no layer invents its own inline model outputs beyond trivial strings.

## 5. Manual smoke-run checklist

One real run before calling v1 done. Documented as `plans/smoke-run.md` content embedded here; execute manually:

- [ ] `.env.local` has a real `OPENROUTER_API_KEY`; confirm `/settings` shows key detected (masked).
- [ ] Pick **inexpensive models only**: 2 candidates and 3–4 judges from free or lowest-price tiers (e.g. current free-tier or <$0.10/M models from the catalog's "free models only" filter).
- [ ] Set trials = 1, all 8 categories, and a **hard spending cap of $0.50** in the review step. Confirm the preflight cost range is under the cap before launching.
- [ ] Watch the arena grid: every cell reaches `scored` or a well-explained failure state; open at least 2 drawers and read judge cards for coherence.
- [ ] Mid-run: refresh the page once (reconnect works), pause and resume once.
- [ ] Verify live spend counter ≤ cap for the whole run; if the cap trips, verify the run stops before overspending and is marked `incomplete` with the cap notice.
- [ ] After completion: report renders; validator checklist matches obvious reality (e.g. math answer marked correct/incorrect matches the actual output); leaderboard row appears (provisional).
- [ ] Export JSON + CSV, open both, spot-check one task's scores against the UI.
- [ ] Check `data/ai-judge.sqlite` grew reasonably (< a few MB for one run) and a `db:backup` copy succeeds.
- [ ] Record actual total cost in the run notes; it must be within the preflight range or the estimator gets a bug ticket.

## Files to implement

Exact paths (test code + config only; app code owned by other plan files):

- `vitest.config.ts`
- `playwright.config.ts`
- `tests/unit/panel-selection.test.ts`
- `tests/unit/scoring.test.ts`
- `tests/unit/eligibility.test.ts`
- `tests/unit/cost.test.ts`
- `tests/unit/retry.test.ts`
- `tests/unit/idempotency.test.ts`
- `tests/unit/calibration.test.ts`
- `tests/unit/validators/common.test.ts`
- `tests/unit/validators/math.test.ts`
- `tests/unit/validators/coding.test.ts`
- `tests/unit/validators/dispatch.test.ts`
- `tests/integration/helpers/mock-openrouter.ts`
- `tests/integration/helpers/test-db.ts`
- `tests/integration/stream-parsing.test.ts`
- `tests/integration/judge-repair.test.ts`
- `tests/integration/cancellation.test.ts`
- `tests/integration/sse-reconnect.test.ts`
- `tests/integration/crash-recovery.test.ts`
- `tests/e2e/global-setup.ts`
- `tests/e2e/full-run-flow.spec.ts`
- `tests/e2e/run-controls.spec.ts`
- `tests/e2e/accessibility.spec.ts`
- `tests/e2e/responsive.spec.ts`
- `tests/fixtures/**` (tree per §4)
- `scripts/record-fixture.ts` (dev-only fixture recorder; never runs in CI)

## Contracts with other modules

- **`lib/scoring.ts`** (scoring plan): must export pure, injectable functions — `median`, `disagreement`, `computeOverall(subScores)`, `bundleRunTotal(categoryMedians)`, `leaderboardScore(runTotals)`, `isEligible(...)`, `calibrationScore(...)` — with no DB or network access, or the unit tests in §1.2/§1.4 cannot exist as written.
- **`lib/run-engine.ts` / panel selection**: panel selection and candidate resolution must be pure functions of `(pool, seed, category)` / `(selection, candidateId)` exported separately from the engine loop (§1.1). The engine must accept an injected base URL (env) and DB handle so integration tests substitute the mock server and temp DB.
- **`lib/openrouter.ts`**: reads `OPENROUTER_BASE_URL` from env at call time (not import-time constant) so tests and Playwright can point it at the mock server. Streaming client must expose the abort path via `AbortSignal`.
- **`lib/validators/*`**: each validator is a pure function `(taskDefinition, rawOutput) → ValidatorResult[]` returning rows matching the `validator_results` schema; word-count and JSON-extraction rules must be documented in-module because tests lock their exact semantics.
- **`lib/db.ts` / migrations**: must support `DATABASE_PATH` override, expose migration runner callable from test helpers, and use one transaction per completed task (crash-recovery tests in §2.5 depend on that atomicity).
- **SSE route** (`/api/runs/[id]/events`): events must carry durable, monotonically increasing IDs persisted in SQLite; `Last-Event-ID` replay is a contract, not an optimization (§2.4, §3.1.4).
- **UI components** (run UI + leaderboard plans): arena cells, drawers, dialogs, live regions, and the model picker must ship the ARIA roles/keyboard behaviors that §3.3 asserts; test IDs (`data-testid`) for arena cells (`cell-<candidate>-<category>`), drawer, step headings, live region, export buttons.
- **Fixtures**: bundle-dependent fixtures import task schemas from `lib/bundles/mini-v1.ts`; the bundle is immutable, so fixture drift indicates an illegal bundle edit.
- **Env/deployment plan (`plans/12-env-deployment.md`)**: defines the npm scripts (`test`, `test:e2e`) and dependency versions this plan assumes; both plans list `vitest`, `@playwright/test`, `@axe-core/playwright` as dev dependencies.

## Acceptance criteria

- [ ] `npm test` runs all unit + integration suites green in < 2 minutes on the dev machine, with no network access and no writes outside temp dirs.
- [ ] `npm run test:e2e` runs all Playwright specs green against the mocked OpenRouter server with a dummy API key.
- [ ] Panel selection tests prove determinism (golden values), self-exclusion with first-seeded-reserve substitution, recorded substitutions, and error on insufficient pools.
- [ ] Scoring tests prove median/disagreement math, server-side overall (judge's claimed overall never aggregated), macro-average bundle totals, and provisional/established boundaries.
- [ ] Validator tests lock exact boundaries: math free=552 / paid=432 (and reject 436), poster fails at ≥ 65 words, story passes only 500–700 inclusive, exact array counts fail both off-by-one directions.
- [ ] Eligibility tests prove infrastructure failure → `incomplete` (never zero) and that judged-bad ≠ incomplete.
- [ ] Retry tests prove bounded exponential backoff with jitter, correct retryable-status classification, and `Retry-After` honoring — all under fake timers.
- [ ] Idempotency tests prove same-run duplicate suppression and prove hashes differ across runs and trials (no benchmark leakage).
- [ ] Integration tests cover: SSE parsing incl. split-UTF-8 chunk boundaries; malformed judge JSON → one schema retry → reserve replacement with all raw attempts persisted; mid-stream cancellation aborting outbound requests; `Last-Event-ID` replay from the durable log across an engine restart; crash-recovery resume that skips scored work and never double-writes derived scores.
- [ ] E2E covers the full configure → preflight → run → reconnect → report → leaderboard → export flow plus pause/resume/cancel/retry controls.
- [ ] Axe scans report no serious/critical violations on all listed pages; keyboard-only completion of run setup and arena inspection passes; live-region announcements and reduced-motion behavior asserted.
- [ ] Responsive checks pass at 375 / 768 / 1440 widths with no horizontal overflow.
- [ ] Fixture tree exists as specified, including the human-reviewed calibration set with provenance README; no test layer defines its own ad-hoc model outputs for covered scenarios.
- [ ] Manual smoke-run checklist executed once with real cheap models under a $0.50 cap, all boxes checked, actual cost within the preflight range.
