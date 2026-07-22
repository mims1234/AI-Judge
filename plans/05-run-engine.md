# 05 — Run Engine (`lib/run-engine.ts`)

## Purpose

Specify the durable orchestration state machine that executes benchmark runs: the in-process queue, run and task lifecycles with SQLite checkpoints, seeded per-category judge panel selection, blind judging, self-judging substitution, trial handling, request-hash idempotency, concurrency, pause/resume/cancel, hard budget cap, and the invalid-judge-JSON retry/replacement pipeline with full `judgment_attempts` persistence.

## Scope

- `lib/run-engine.ts` — the singleton engine.
- State machines for `runs.status` and `task_results.status`.
- Panel selection written to `category_judge_panels`.
- Judge prompt assembly rules (blindness) and judgment attempt persistence.
- Recovery after process restart.

Out of scope: HTTP surfaces (plan 03), the OpenRouter wire client (plan 04 — the engine calls `streamChat`), score math and calibration (plan 06 — the engine calls `aggregateTask` / `finalizeRun`), prompt content (bundle seed plans).

---

## Architecture

### Singleton & queue

One engine instance per Node process, created lazily and stored on `globalThis.__aiJudgeEngine` so Next.js dev-mode module reloads don't spawn duplicates:

```ts
export interface RunEngine {
  enqueue(runId: string): void;
  pause(runId: string): void;     // throws InvalidStateError per the transition table
  resume(runId: string): void;
  cancel(runId: string): void;
  retryTask(runId: string, taskResultId: string): void;
  events(runId: string): EventEmitter;   // per-run channel consumed by the SSE route
}
export function getRunEngine(): RunEngine;
```

- **In-process FIFO queue** of run ids. Exactly **one run executes at a time** (single-operator tool; keeps SQLite writes and budget accounting simple). Enqueued runs stay `queued`; when the worker loop is free it dequeues the next.
- The queue itself is in-memory but reconstructable: on engine construction (first `getRunEngine()` call after boot), run **recovery** — `SELECT id FROM runs WHERE status IN ('running','queued') ORDER BY created_at`; any `running` run found means the process died mid-run: keep its status, enqueue it first; then enqueue the `queued` ones. Resumption is safe because all progress lives in `task_results` checkpoints. `paused` runs stay paused until the user resumes.
- The engine is the **only writer** of `runs.status`, `task_results`, `validator_results`, `judgment_attempts`, and `run_events` during execution (the create-run route writes the initial rows, the retry route resets one row — both then hand control back via `enqueue`/`retryTask`).

### Event emission

`emitEvent(runId, type, payload)`: for persistent types, INSERT into `run_events` and emit `{ id, type, payload }` on the run's EventEmitter; for the ephemeral types (`candidate.delta`, `judge.delta`, `heartbeat`), emit only (no insert, no id). Event names, payloads, and persistence rules are the canonical contract in `plans/00-overview.md` §4.5 (framed by plan 03 § SSE event catalog) — this module implements them exactly.

---

## Run lifecycle

```
queued ──start──▶ running ──all tasks scored──────────▶ completed
                 running ──user pause───▶ paused ──resume──▶ running
                 running ──user cancel──────────────────────▶ cancelled
                 paused  ──user cancel──────────────────────▶ cancelled
                 queued  ──user cancel──────────────────────▶ cancelled
                 queued  ──user pause───▶ paused
                 running ──budget cap / unrecoverable errors▶ incomplete
```

Terminal statuses: `completed`, `cancelled`, `incomplete`. Terminal transitions write `finished_at`, compute `bundle_run_scores` via plan 06's `finalizeRun(runId)` (only `completed` runs are leaderboard-eligible; `finalizeRun` records eligibility), and emit a final `run.status` followed by `run.complete`.

Terminal-status decision when work stops:

- Every task_result `scored` → `completed`.
- User cancelled → `cancelled` (regardless of task states; in-flight aborted).
- Otherwise (≥1 task terminally `error`, or budget cap hit with pending work) → `incomplete`. **Infrastructure failures yield `incomplete`, never zero scores** — errored tasks carry no score and the run never enters the main leaderboard.

`started_at` set on the first `queued → running` transition only.

---

## Task lifecycle (`task_results.status`)

Statuses are the durable checkpoints:

```
pending ─▶ streaming ─▶ validating ─▶ judging ─▶ scored
   │            │            │           │
   └────────────┴────────────┴───────────┴──▶ error   (terminal until user retry)
```

Per-status meaning and the checkpoint invariant (what is guaranteed persisted when a row *leaves* the status):

| status | meaning | persisted on exit |
|---|---|---|
| `pending` | not started | — |
| `streaming` | candidate completion in flight | `raw_output`, `output_hash`, `provider`, `finish_reason`, `tokens`, `cost`, `latency` (one transaction) |
| `validating` | deterministic validators running | all `validator_results` rows |
| `judging` | 3-judge panel in flight | all final `judgment_attempts` rows |
| `scored` | aggregated (plan 06 wrote `task_scores`) | median, disagreement in `task_scores` |
| `error` | terminal failure (`error` column = JSON `{ kind, message, attempts }`; `kind` ∈ `infra_failure`, `judging_failure`) | — |

**Status writes are transactional with their payload**: e.g. candidate completion writes raw_output + metadata + `status='validating'` in one transaction, so a crash never leaves text persisted with a stale status or vice versa.

**Resume-by-skipping**: the executor's scheduling pass selects work by status. `pending` → run from the top. `streaming` at recovery time → the stream died with the process; reset to `pending` (nothing durable was lost — partial text is never persisted). `validating` → re-run validators (deterministic, idempotent; delete any partial `validator_results` first). `judging` → re-run only the judge slots lacking a final judgment attempt (see Judging § idempotency). `scored`/`error` → skip. This satisfies "interrupted runs resume by skipping scored work".

---

## Panel selection (`category_judge_panels`)

Executed inside the create-run transaction (plan 03 route calls `selectPanels(...)` exported from this module):

- Inputs: `run.seed`, ordered `judge_pool` (as submitted), included categories (canonical order: roleplay, coding, math, research, marketing, poster, story, judging).
- Per category: `panel_seed = hash32(run.seed + ":" + category)` (xxhash or FNV-1a of the string — deterministic, no RNG state carryover between categories). Produce a **seeded Fisher-Yates shuffle** of the full judge pool using a PRNG (mulberry32) seeded with `panel_seed`.
- Store one row per judge in shuffle order using the `category_judge_panels` columns from `plans/01-database.md` §3.7: the first three shuffled judges get `panel_position` 0–2 (`reserve_order` NULL) — **the active panel**; every later judge gets `panel_position` NULL and `reserve_order` 0, 1, 2, … — **the reserves in deterministic substitution order** (0 = first reserve).
- The same 3-judge panel judges **every candidate** in that category (fair comparison). Reserves are consumed per-need (self-judging, invalid JSON) as specified below.
- Family diversity: prefer it *softly* — after the shuffle, if the top 3 contain ≥2 judges sharing a provider prefix (`id.split("/")[0]`) and a different-provider judge exists later in the order, swap the later one up into position 2. This is a single deterministic post-pass; no fragile hard rules, per the master plan.

Reproducibility: given the same seed, pool order, and categories, panels are byte-identical. Panels are stored, never recomputed at read time.

---

## Executor algorithm

Main loop per run (`executeRun(runId)`):

```
1. status → running (if queued); emit run.status (+ notice RUN_RESUMED if coming from paused)
2. loop over candidates SEQUENTIALLY (in run_candidates order)        // default candidate_concurrency=1
     loop over included categories (canonical order)
       loop over trial_index 0..trials_per_pair-1
         t = task_results row for (candidate, category, trial)
         if t.status in (scored, error): continue          // resume-by-skipping
         checkControl()                                    // pause/cancel/budget gate — see below
         runTask(t)
3. terminal-status decision; finalizeRun; emit run.status + run.complete
```

If `candidate_concurrency > 1` (max 4), step 2's outer loop runs that many candidates concurrently via a worker-pool; **within one candidate, categories/trials stay sequential**, and total in-flight OpenRouter requests are capped at `candidate_concurrency × 4` (1 candidate stream + 3 judges each). Default stays 1 to avoid fan-out storms.

`runTask(t)` phases:

**A. Candidate streaming** (`pending → streaming`):

- Build messages: `system` = bundle wrapper (from the run's frozen `parameters_json` snapshot, never the live bundles table), `user` = task_body. Temperature = run parameter (default 0.7), maxTokens = task token_limit.
- **Idempotency**: compute the request hash (plan 04 `request_hash`) **plus the run-scoping tuple** `(run_id, task_result_id)`. Before calling, check an in-memory per-run map `sentHashes: Map<request_hash, task_result_id>`; if this exact hash was already successfully billed in this run for a *different* task_result, log and proceed (distinct trials intentionally repeat identical requests — see Trials below); if it was billed for the *same* task_result (double-dispatch bug window, e.g. recovery re-entry), skip the call and reuse the persisted output. Additionally, before any call, re-read the row: if `raw_output` is already non-null with tokens recorded, skip straight to validation. This is the "no duplicate billing within a run" guarantee without leaking judgments across trials/runs.
- Call `streamChat` with `onDelta` → `candidate.delta` events; retries handled inside plan 04 (engine forwards `onRetry` as `notice`/`RETRY_SCHEDULED` events).
- Success → one transaction: update row (`raw_output`, `output_hash` = sha256(text), `provider`, `finish_reason`, `tokens`, `cost`, `latency`, `status='validating'`), increment `runs.total_cost_usd`; emit `candidate.complete` (+ `run.cost`).
- `OpenRouterError` after 3 attempts → transaction: `status='error'`, `error = {kind:'infra_failure', ...}`; emit `task.status` with the error payload (plan 03); continue to next task.

**B. Validation** (`validating`): run the category's validator chain (plan 06, `lib/validators/index.ts` `runValidators(category, rawOutput, taskSnapshot)` — pure & synchronous). Persist all `validator_results` + `status='judging'` in one transaction; emit `validation.complete`.

**C. Judging** (`judging`): see next section. On all 3 final judgments landing, call plan 06 `aggregateTask(taskResultId)` which writes `task_scores`; then `status='scored'`; emit `task.scored`.

`checkControl()` before each task and between judge dispatches:

- `cancelRequested` → abort controller fired, stop scheduling, jump to terminal handling (`cancelled`).
- `pauseRequested` → stop scheduling **new** work; currently in-flight task finishes its current phase (candidate stream and any in-flight judges run to completion so money already committed produces persisted value); then set `paused`, emit `RUN_PAUSED` notice, park the loop on a resume promise. Resume → re-enter the scheduling loop (which re-selects work by status).
- **Budget gate**: if `runs.total_cost_usd + committedEstimate ≥ budget_usd` where `committedEstimate` is the worst-case cost of the *next* task (candidate max_tokens + 3 judges, priced via the pricing cache) → do not start it; emit `notice` with code `BUDGET_CAP_REACHED`; stop scheduling; terminal status `incomplete`. The cap is enforced **before spending**, mid-run, not just at preflight. In-flight work is not aborted by the cap (its cost was already committed when dispatched).

---

## Judging pipeline

### Blind prompt assembly

Judge messages contain **only**: judge system prompt (bundle's judge rubric from the frozen snapshot), the task (wrapper + task_body), the validator findings block (plan 06 defines the exact "trusted context" rendering), and the candidate's raw answer. **The candidate model id/name/provider must never appear** — enforce with an assertion that scans assembled judge messages for every candidate model id and each id's suffix after `/` (e.g. both `openai/gpt-5.1` and `gpt-5.1`) and throws before dispatch if found. Judges run at temperature 0, maxTokens 1536, with `response_format` json_schema when supported (plan 04).

### Panel & self-judging substitution

For task t (category c, candidate m):

1. Active panel = the 3 rows of `category_judge_panels` for (run, c) with `panel_position` 0–2.
2. **Self-judging resolution**: if any active member's `judge_model_id === m`, replace it **for this candidate's tasks only** with the first reserve (`reserve_order` 0, then 1, … skipping reserves that also equal m or are already on this task's panel). The substitution is recorded on the judgment attempt rows: `is_substitute = 1`, `substituted_for = <original judge id>`, and a `notice`/`JUDGE_REPLACED` event is emitted once per (candidate, category). Other candidates in the category keep the original panel. If the pool is exhausted (no valid reserve), the task fails with `error.kind='judging_failure'` — preflight's pool-size rule (plan 03) makes this unreachable in practice.
3. Dispatch the 3 judge calls **in parallel** (`Promise.allSettled`), each with its own AbortSignal child of the run's controller, emitting `judge.started` then `judge.delta` events.

### Invalid-JSON handling & attempts

Per judge slot, `judgment_attempts` accumulates every attempt (`attempt` = 1,2,3…; columns per `plans/01-database.md` §3.10: `task_result_id, judge_model_id, attempt, is_final, is_substitute, substituted_for, raw_output, parsed_json, evidence, parse_status`, the extracted sub-scores, `claimed_overall`, `server_overall`, `verdict`, tokens, cost, latency):

1. **Attempt 1**: parse the raw output — strip Markdown code fences if present, then `JSON.parse`, then `JudgeOutputSchema.safeParse` (plan 06). Valid → `parse_status='first_try'`, `is_final=1`, done.
2. Invalid → persist attempt 1 with `parse_status='invalid'` and the Zod/parse error in `evidence`. **One schema-focused retry** (attempt 2, same judge): append a corrective user message containing the exact JSON Schema and the specific parse errors ("Your previous reply was not valid JSON matching the schema. Errors: … Reply with ONLY the JSON object."). Valid → `parse_status='repaired'`, `is_final=1`.
3. Still invalid → persist attempt 2; **replace with the deterministically selected reserve judge**: next `reserve_order` not equal to the candidate and not already used on this task. The reserve's judgment is attempt 3 (with its own inner schema-retry allowed as attempt 4), recorded with `is_substitute=1`, `substituted_for=<failed judge id>`. Emit `notice`/`JUDGE_REPLACED`.
4. Reserve also fails (or no reserve left) → the slot's final attempt keeps `parse_status='invalid'`, `is_final=1`, and the task cannot be `scored`: `status='error'`, `error.kind='judging_failure'`. (User can retry the task later; all attempts remain persisted for the `/judges` analytics.)

An `OpenRouterError` (infra) during a judge call, after plan 04's 3 wire attempts, is treated like step 3's replacement trigger (persist an attempt row with `parse_status='invalid'`, `evidence` = the error) — one reserve substitution is tried before declaring `judging_failure`; this keeps a single flaky judge from voiding a paid candidate answer.

Every attempt row records tokens/cost/latency and increments `runs.total_cost_usd`. `judge.complete` is emitted only for the final attempt per slot. Judge-slot idempotency on resume: a slot with an `is_final=1` attempt is skipped; others restart from attempt max(attempt)+1.

### Trials

- `trials_per_pair` (default 1, recommended 3) creates independent `task_results` rows (`trial_index` 0..n-1) at run creation.
- **No judgment or candidate-output reuse across trials or runs** — each trial makes fresh candidate and judge calls even though the request bytes are identical (repetition statistics require independence; the idempotency map explicitly allows identical hashes across *different* task_result ids, blocking only same-row double dispatch).
- Trial aggregation (task score = median across trials) is plan 06's job; the engine just executes each trial as an independent task.

---

## Pause / resume / cancel semantics (engine side)

- Control requests arrive via the engine methods (called by plan 03 routes) and set flags on the run's in-memory control block `{ pauseRequested, cancelRequested, abortController, resumeSignal }`; the DB status is updated by the executor when the state actually changes (single-writer rule). Exception: `queued → paused/cancelled` and `paused → cancelled` are applied immediately (nothing in flight).
- **Cancel** fires `abortController.abort()` → all in-flight `streamChat` calls throw `aborted`; in-flight task rows keep their last durable checkpoint (a task cancelled mid-`streaming` stays whatever it was before the phase-exit transaction, i.e. no partial text persisted); run → `cancelled`, `finished_at` set, `run.status` + `run.complete` emitted. Cancelled runs cannot be resumed (retry-task is also disallowed on cancelled runs, plan 03).
- **Pause** never aborts in-flight requests (graceful): current task finishes its current phase, then the loop parks. Status timeline: `pauseRequested` set → engine finishes phase → `runs.status='paused'` → `run.status` event + `notice`/`RUN_PAUSED`.
- **Resume** flips `paused → running` (or `queued` behind another active run) and re-enters scheduling; already-`scored`/`error` rows are skipped by design.
- Process crash = implicit pause: recovery re-enqueues `running` runs (see Architecture) and the phase-transactional checkpoints guarantee no lost billed work beyond a single in-flight candidate stream (reset `streaming → pending`) — its cost was never recorded because cost is written in the same transaction as the output.

---

## Files to implement

- `lib/run-engine.ts` — `getRunEngine`, `RunEngine`, `selectPanels`, executor, control block, recovery, judge pipeline, blindness assertion, budget gate, event emission.
- `lib/prng.ts` — `hash32` (FNV-1a), `mulberry32`, `seededShuffle` (shared with tests; deterministic).
- Migrations (owned by `plans/01-database.md`) already include the columns this plan requires: `judgment_attempts.is_substitute`, `judgment_attempts.substituted_for`, `judgment_attempts.is_final`, `judgment_attempts.evidence`, `task_results.error` (JSON `{ kind, message, attempts }`), and the `run_events` table (§3.14 there).

## Contracts with other modules

- **plan 03**: routes call `enqueue/pause/resume/cancel/retryTask`; `POST /api/runs` calls `selectPanels` inside its transaction; the SSE route consumes `events(runId)` + `run_events`. Event payloads must match plan 03's catalog byte-for-byte (shared `SseEventSchema`).
- **plan 04**: the engine is the only `streamChat` caller; it supplies AbortSignals, forwards `onRetry`, consumes `request_hash`, and maps exhausted-retry `OpenRouterError` to `infra_failure`.
- **plan 06**: calls `runValidators` (phase B), `aggregateTask` (writes `task_scores`), `finalizeRun` (writes `bundle_run_scores`, eligibility), and the budget gate's `estimateTaskCost` helper; provides plan 06 with fully persisted `judgment_attempts` including claimed vs computed overall inputs.
- **plans 00–02**: schema/migrations; frozen run snapshot format in `runs.parameters_json` (defined in plan 03 §3) that this engine reads instead of live bundle tables.

## Acceptance criteria

- [ ] Engine is a `globalThis` singleton; dev-mode reload does not double-execute runs; exactly one run executes at a time; FIFO order.
- [ ] Boot recovery re-enqueues `running`/`queued` runs; `streaming` rows reset to `pending`; `validating`/`judging` rows resume idempotently; `scored`/`error` rows are never re-executed.
- [ ] Run status machine matches the diagram; terminal decision: all-scored→`completed`, user→`cancelled`, else→`incomplete`; infra failures never become zero scores.
- [ ] Every task phase persists its payload and status transition in one SQLite transaction; crash at any point loses at most one unpersisted in-flight stream and no recorded cost.
- [ ] `selectPanels` is deterministic from (seed, pool order, categories): per-category `panel_seed` stored, full shuffle stored with `reserve_order`, positions 0–2 active, soft family-diversity post-pass applied; identical inputs → identical panels (unit-tested).
- [ ] Blind judging: assembled judge messages never contain any candidate model id or its short name (runtime assertion + unit test); judges run at temperature 0 with structured outputs when supported.
- [ ] Self-judging: a panel member matching the candidate is swapped for the first eligible seeded reserve **for that candidate only**, recorded via `is_substitute`/`substituted_for`, other candidates unaffected.
- [ ] Invalid judge JSON: attempt 1 → schema-focused retry (attempt 2) → deterministic reserve replacement (attempts 3/4) → else `judging_failure`; **all** attempts persisted in `judgment_attempts` with parse_status/tokens/cost/latency; `judge.complete` emitted once per slot.
- [ ] Trials create independent task_results; no output/judgment reuse across trials or runs; same-row double dispatch blocked by the request-hash map + persisted-output check (no duplicate billing within a run).
- [ ] Candidates sequential by default, 3 judges parallel per task; `candidate_concurrency` ≤ 4 with in-flight request cap.
- [ ] Pause finishes the current phase then parks (no aborts); cancel aborts all in-flight via AbortController and is terminal; resume skips completed work; crash-recovery behaves as implicit pause.
- [ ] Budget cap enforced before each task dispatch using pricing-cache worst-case estimate; on trip: `BUDGET_CAP_REACHED` notice, no new spend, run → `incomplete`.
- [ ] Vitest coverage: panel determinism/diversity/self-exclusion, resume-skipping matrix (each status), idempotency map, budget gate math, invalid-JSON ladder incl. reserve exhaustion, blindness assertion, pause/cancel semantics with mocked `streamChat`.
