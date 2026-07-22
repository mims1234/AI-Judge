# 00 — Project Overview & Shared Contracts

## Purpose and Scope

This document is the **shared contract file** for the AI Judge project. Every other plan file (01–12) references the names, statuses, event shapes, and layout defined here. If a plan file conflicts with this document, this document wins; if this document conflicts with the master plan (`ai_judge_benchmark_b482260d.plan.md`), the master plan wins.

Scope of this file:

- Project goal and stack constraints
- Full route map (pages + API routes)
- Canonical shared contracts: SQLite table names, `task_results` statuses, SSE event names and payload shapes, the 8 category names, and the `lib/` + `components/` file layout
- Cross-cutting methodology rules that every module must respect
- Index of the other plan files and their module ownership

This file contains **no implementation code** — it is the reference vocabulary for implementers.

---

## 1. Goal

**AI Judge** is a single-operator benchmark lab that:

1. Sends a versioned **prompt bundle** (8 category tasks wrapped in a common wrapper) to one or more **candidate models** via OpenRouter, streaming their answers live.
2. Runs **deterministic validators** (JSON parseability, required keys, exact array counts, word limits, known math answers) on each answer.
3. Has a **seeded 3-judge panel** of LLMs score each answer blind (candidate identity never revealed), at temperature 0, returning structured JSON verdicts with scores and evidence.
4. Aggregates scores (median of server-computed judge overalls, disagreement spread, macro-average across categories) into **bundle-version-scoped leaderboards** stored durably in SQLite.

The product emphasis is **reproducibility and fairness**: seeded panels, immutable bundles, stored hashes/parameters, durable checkpointed runs that survive restarts, and honest handling of infrastructure failures.

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | UI and API routes in one repo |
| Styling | Tailwind CSS | Design tokens per master plan visual direction |
| Database | SQLite via `better-sqlite3` | Local file DB, WAL mode, zero ops |
| Model API | OpenRouter | List models (cached ~1h) + streaming chat completions |
| Live updates | Server-Sent Events (SSE) | Reconnectable with event IDs; SQLite is source of truth |
| Validation | Zod | Bundle definitions, API payloads, SSE events, judge JSON |
| Testing | Vitest + Playwright | Scoring/validator/engine units + key browser flows |
| Secrets | `.env.local` | `OPENROUTER_API_KEY` server-only; never sent to the client |

### Environment variables

```
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
DATABASE_PATH=./data/ai-judge.sqlite
```

### Hard constraint: one long-running Node process, no serverless

The app MUST target a **single long-running Node.js process** (e.g. `next start` on a VPS), not serverless hosting. Reasons, which every module must respect:

- The **run engine** is an in-process worker (durable state machine) that outlives individual HTTP requests. Serverless would kill it mid-run.
- `better-sqlite3` is a synchronous, file-based, single-process driver. The SQLite file lives on local disk and is only safe with one writer process.
- SSE connections for `/api/runs/[id]/events` are long-lived open HTTP responses.

Implications: no assumption of horizontal scaling; module-level singletons (DB handle, run engine, in-memory event buffers) are allowed and expected; all durable state goes to SQLite so a process restart can resume from checkpoints.

There is no auth, no multi-user support, no Redis, and no separate backend in v1.

## 3. Route map

### Pages (App Router)

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Landing: brand hero, methodology, live ranking preview, primary CTAs |
| `/models` | `app/models/page.tsx` | Searchable OpenRouter catalog (virtualized, 400+ models) and model details |
| `/bundles` | `app/bundles/page.tsx` | Immutable bundle versions, category tasks, schemas, changelogs |
| `/run` | `app/run/page.tsx` | Four-step run configuration: Bundle → Candidates → Judge pool → Review cost & launch |
| `/runs/[id]` | `app/runs/[id]/page.tsx` | Reconnectable live workbench (arena grid) and completed report |
| `/leaderboard` | `app/leaderboard/page.tsx` | Bundle/category rankings and reliability metrics |
| `/compare` | `app/compare/page.tsx` | Side-by-side comparison of up to four models |
| `/judges` | `app/judges/page.tsx` | Judge calibration, harshness/leniency, evidence quality, parse failures |
| `/settings` | `app/settings/page.tsx` | API-key status, concurrency, trials, budget, timeout defaults |

### API routes

| Method + Route | File | Purpose |
|---|---|---|
| `GET /api/models` | `app/api/models/route.ts` | Proxy OpenRouter model list, cached in SQLite (`models_cache`) ~1 hour |
| `POST /api/runs/preflight` | `app/api/runs/preflight/route.ts` | Validate model availability/context; estimate tokens, cost range, duration; self-judging warnings |
| `POST /api/runs` | `app/api/runs/route.ts` | Persist an immutable run snapshot (prompts, parameters, seed) and enqueue it |
| `GET /api/runs/[id]` | `app/api/runs/[id]/route.ts` | Durable run snapshot for page load / reconnect rehydration |
| `GET /api/runs/[id]/events` | `app/api/runs/[id]/events/route.ts` | SSE stream with monotonic event IDs for replay/reconnection (`Last-Event-ID`) |
| `POST /api/runs/[id]/pause` | `app/api/runs/[id]/pause/route.ts` | Pause a running run at the next safe checkpoint |
| `POST /api/runs/[id]/resume` | `app/api/runs/[id]/resume/route.ts` | Resume a paused or interrupted run, skipping completed work |
| `POST /api/runs/[id]/cancel` | `app/api/runs/[id]/cancel/route.ts` | Cancel a run; abort in-flight streams via `AbortController` |
| `POST /api/runs/[id]/tasks/[taskId]/retry` | `app/api/runs/[id]/tasks/[taskId]/retry/route.ts` | Rerun one failed task result |
| `GET /api/runs?status=` | `app/api/runs/route.ts` (same file as POST) | List runs, optionally filtered by status (used by the nav-shell run indicator) |
| `GET /api/leaderboard?bundle=&category=&format=json\|csv` | `app/api/leaderboard/route.ts` | Ranked leaderboard rows scoped to a bundle version; optional category re-ranking and CSV/JSON export of the current view |
| `GET /api/runs/[id]/export?format=json\|csv` | `app/api/runs/[id]/export/route.ts` | Reproducible export of a full run |
| `GET /api/settings` + `PUT /api/settings` | `app/api/settings/route.ts` | Read/write operator run defaults (`app_settings` table; owned by `plans/08-frontend-pages.md`) |
| `POST /api/settings/test-key` | `app/api/settings/test-key/route.ts` | Server-side OpenRouter key test for `/settings` |

## 4. Canonical shared contracts

### 4.1 SQLite table names (exact, snake_case)

Defined in full in `plans/01-database.md`. Every module must use these exact names:

1. `bundles`
2. `tasks`
3. `models_cache`
4. `runs`
5. `run_candidates`
6. `run_judge_pool`
7. `category_judge_panels`
8. `task_results`
9. `validator_results`
10. `judgment_attempts`
11. `task_scores`
12. `bundle_run_scores`
13. `judge_calibration_results`

Two auxiliary tables also exist (added by plans 03 and 08, DDL in `plans/01-database.md`): `run_events` (durable SSE event log for `Last-Event-ID` replay) and `app_settings` (single-row operator defaults for `/settings`).

### 4.2 `task_results.status` values (exact strings)

A task result is one candidate × task × trial. Its lifecycle is a durable checkpoint chain; each transition is persisted so interrupted runs resume without repeating completed work.

| Status | Meaning |
|---|---|
| `pending` | Created at run snapshot time; no work started |
| `streaming` | Candidate completion is streaming from OpenRouter |
| `validating` | Full candidate output received; deterministic validators running |
| `judging` | 3-judge panel evaluations in flight |
| `scored` | All judgments persisted, `task_scores` row written — terminal success |
| `error` | Infrastructure failure after bounded retries — terminal failure; NOT a zero score |

Allowed transitions: `pending → streaming → validating → judging → scored`, and any non-terminal state `→ error`. A retry (manual or on resume) resets `error → pending`. No other transitions are legal.

### 4.3 Run statuses

`runs.status` values (exact strings): `queued`, `running`, `paused`, `completed`, `cancelled`, `incomplete`. `POST /api/runs` creates the run directly in `queued`. Terminal statuses are `completed` (every task result `scored`), `cancelled` (user cancel), and `incomplete` (≥1 task terminally `error`, or the budget cap tripped with pending work — infrastructure failures never become zero scores; only `completed` runs are leaderboard-eligible).

### 4.4 The 8 category names (exact, lowercase)

```
roleplay, coding, math, research, marketing, poster, story, judging
```

These strings are used in `tasks.category`, `category_judge_panels.category`, SSE payloads, validator dispatch keys, UI labels (capitalized only at render time), and leaderboard grouping. Never abbreviate or re-case them in data or APIs.

### 4.5 SSE event names and payload shapes

Emitted on `GET /api/runs/[id]/events`. Every **persisted** event has a monotonically increasing integer `id` (SSE `id:` field; a global `run_events` AUTOINCREMENT id, which is strictly increasing within any run's stream), so `Last-Event-ID` replay works. Event `data:` is JSON. All payloads include `runId` and use camelCase keys. Zod schemas for these live in `lib/schemas.ts` (`SseEventSchema`, discriminated union on event name).

| Event name | Persisted? | Payload shape (TypeScript-ish) |
|---|---|---|
| `run.status` | yes | `{ runId, status: RunStatus, totalCostUsd: number, progress: { scored: number, error: number, total: number }, elapsedMs: number }` — emitted on every `runs.status` change (pause, resume, terminal, …) |
| `task.status` | yes | `{ runId, taskResultId, taskId, category, candidateModelId, trialIndex, status: TaskResultStatus, error?: { kind: 'infra_failure' \| 'judging_failure', message: string } }` |
| `candidate.delta` | no (ephemeral, no `id:`) | `{ runId, taskResultId, delta: string, tokens?: number }` — streamed text chunk of the candidate answer; `tokens` = cumulative completion-token estimate (client uses it for cell counters and duplicate-delta suppression) |
| `candidate.complete` | yes | `{ runId, taskResultId, finishReason: string, tokens: { prompt: number, completion: number }, costUsd: number, latencyMs: number }` |
| `validation.complete` | yes | `{ runId, taskResultId, checks: Array<{ validator: string, passed: boolean, expected?: string, actual?: string, details: string }>, allPassed: boolean }` |
| `judge.started` | yes | `{ runId, taskResultId, judgeModelId, attempt: number }` |
| `judge.delta` | no (ephemeral, no `id:`) | `{ runId, taskResultId, judgeModelId, delta: string }` — judge token stream (collapsed by default in the UI) |
| `judge.complete` | yes | `{ runId, taskResultId, judgeModelId, attempt: number, parseStatus: 'first_try' \| 'repaired' \| 'invalid', substituted: boolean, substitutedFor: string \| null, verdict?: 'pass' \| 'partial_pass' \| 'fail', scores?: { correctness, requirement_compliance, quality, honesty }, claimedOverall?: number, serverOverall?: number, feedback?: { whatWasGood: string[], whatWasTerrible: string[], whatWasMissing: string[], constraintViolations: string[], criticalErrors: string[], specificEvidence: string[], oneBestImprovement: string }, costUsd: number, latencyMs: number }` — emitted once per judge slot, for the final attempt only |
| `task.scored` | yes | `{ runId, taskResultId, taskId, category, candidateModelId, trialIndex, median: number, disagreement: number, flagged: boolean, judgeOveralls: number[] }` |
| `run.cost` | yes | `{ runId, totalCostUsd: number, budgetUsd: number \| null }` — emitted after each billable call |
| `notice` | yes | `{ runId, scope: 'run' \| 'task', code: string, message: string, taskResultId?: string, details?: object }` — non-fatal notices; known codes: `BUDGET_CAP_REACHED`, `RETRY_SCHEDULED`, `JUDGE_REPLACED`, `RUN_PAUSED`, `RUN_RESUMED` |
| `run.complete` | yes | `{ runId, status: 'completed' \| 'cancelled' \| 'incomplete', bundleRunScore: number \| null, totalCostUsd: number }` — emitted exactly once at terminal transition |
| `resync` | no (per-connection) | `{ runId, lastEventId: number }` — sent when the client's replay cursor cannot be served; the client must refetch `GET /api/runs/[id]` and continue live |
| `heartbeat` | no (ephemeral, no `id:`) | `{ runId, ts: number }` — every 15s to keep the connection alive (client watchdog input) |

Notes:
- `candidate.delta` / `judge.delta` events are **not** persisted (only final full text is stored) and carry no `id:` field, so they never advance the browser's `Last-Event-ID` cursor; on reconnect, the client rehydrates accumulated text from `GET /api/runs/[id]` and resumes from live deltas.
- All persisted event types are replayable by ID from the durable `run_events` table (DDL in `plans/01-database.md`), so any cursor is replayable; `resync` exists as the fallback if a cursor ever cannot be served.
- The run engine (`plans/05-run-engine.md`) is the only emitter; the SSE route (`plans/03-backend-api.md`) frames and replays; the workbench (`plans/09-run-workbench.md`) consumes exactly this vocabulary.

### 4.6 `lib/` and `components/` layout (exact paths)

```
lib/
  db.ts                    # better-sqlite3 singleton, WAL, numbered migrations
  schemas.ts               # Zod: bundle, API payloads, SSE events, judge output
  openrouter.ts            # list models + streaming chat client
  bundles/mini-v1.ts       # seeded tasks + prompts (built from plans/02-seed-bundle.md)
  scoring.ts               # median, disagreement, eligibility, calibration
  run-engine.ts            # durable state machine, panel assignment, retries
  api-helpers.ts           # error envelope, Zod parse wrapper, SSE framing (plans/03)
  prng.ts                  # hash32 / mulberry32 / seededShuffle (plans/05)
  env.ts                   # fail-fast env validation (plans/12)
  cn.ts                    # clsx + tailwind-merge class helper (plans/07)
  format.ts                # score/cost/latency/token formatters (plans/07)
  fuzzy.ts                 # dependency-free fuzzy matcher for ModelPicker (plans/08)
  client/                  # browser-side SSE client: useRunStream.ts, runStore.ts, runDraft.ts (plans/09)
  validators/
    common.ts              # JSON, keys, types, counts, word limits
    math.ts                # compute and compare known math answer
    index.ts               # category → validator dispatch
components/
  ui/                      # shared primitives (plans/07-design-system.md): ScoreBadge.tsx,
                           #   VerdictBadge.tsx, FeedbackChip.tsx, StreamPanel.tsx, ProgressRail.tsx,
                           #   StatCard.tsx, DataTable.tsx, Button.tsx, Input.tsx, Badge.tsx,
                           #   Tooltip.tsx, Drawer.tsx, Modal.tsx, Tabs.tsx, EmptyState.tsx,
                           #   Skeleton.tsx, StatusDot.tsx, DisagreementFlag.tsx,
                           #   StatusAnnouncer.tsx, AppShell.tsx
  models/ModelPicker.tsx   # fuzzy-search command-palette model selector (plans/08)
  arena/ArenaGrid.tsx      # candidates × categories live matrix (plans/09)
  arena/JudgeVerdictCard.tsx  # structured verdict card, never raw JSON (plans/09)
  arena/ValidatorPanel.tsx    # objective checklist: schema, counts, word limits, math (plans/09)
  leaderboard/LeaderboardTable.tsx  # ranked rows with expandable category detail (plans/10)
  charts/CategoryRadar.tsx    # per-category radar chart, with non-chart alternative (plans/10)
  charts/Sparkline.tsx        # inline trend/spread line (plans/10)
  charts/ScoreDistributionStrip.tsx  # judge/trial score marks on a 0–10 rail (plans/10)
  charts/MiniBar.tsx          # horizontal cost/latency comparison bar (plans/10)
  landing/VerdictPlane.tsx    # hero signal/verdict SVG (plans/08)
```

The master plan's flat `components/` list (ModelPicker, ArenaGrid, StreamPanel, JudgeVerdictCard, ValidatorPanel, LeaderboardTable, CategoryRadar, ScoreBadge) maps onto these subdirectories; `ScoreBadge` and `StreamPanel` live in `components/ui/` as shared primitives. The frontend plans (07–10) add further page-specific components under `components/run/`, `components/arena/`, `components/models/`, `components/bundles/`, `components/settings/`, `components/landing/`, `components/compare/`, `components/judges/`, and `components/report/` — those files are owned by their plan files and must not conflict with the names above.

## 5. Cross-cutting methodology rules

Every module MUST comply with these; they are what keeps the leaderboard honest.

1. **Blind judging.** Judge prompts contain only the original task and the raw candidate answer. The candidate model's name, provider, or any identifying metadata is NEVER included in any judge prompt.
2. **Seeded per-category 3-judge panels.** For each run, each category gets exactly one 3-judge panel selected deterministically from the judge pool using the run's stored seed. The same panel judges **every candidate** in that category. The panel and seed are persisted (`category_judge_panels`) so the selection is reproducible. A seeded reserve ordering over the remaining pool is also persisted (`reserve_order`).
3. **Reserve-judge substitution (self-judging).** Preflight warns when a candidate model is also in the judge pool. If a panel member would judge its own answer, substitute the first seeded reserve judge **for that candidate's answers only**, and record the substitution on the judgment. Panels prefer family diversity but must not rely on fragile model-ID prefix parsing.
4. **Server-computed overall score.** The official overall for each judgment is the server-side average of the four sub-scores (correctness, requirement_compliance, quality, honesty). The judge's self-claimed `overall_score` is stored for calibration; a large mismatch lowers that judge's meta-rating. UI and leaderboard use only the server-computed value.
5. **Temperature-0 judging.** Judge calls use temperature 0 where the provider supports it, but determinism is not assumed. All generation parameters, prompt/bundle hashes, model IDs, provider route, seed, and timestamps are stored for reproducibility.
6. **No judgment reuse across trials or runs.** Request hashing prevents accidental duplicate billing *within* one run, but judgments are never reused across independent trials or runs — doing so would invalidate repetition statistics.
7. **Eligibility: infrastructure failures ≠ zero.** Network errors, timeouts, provider 5xx after bounded retries produce `task_results.status = 'error'` and an `incomplete` bundle run — never a zero quality score. Only complete bundle runs (all included categories `scored`) enter the main leaderboard. Models are marked **provisional** until they have three complete bundle runs; the leaderboard score is the median of complete bundle-run scores.
8. **Deterministic validation before judging.** Validators run on the raw candidate output before any judge call. Findings are passed to judges as trusted context and displayed separately in the UI (`ValidatorPanel`) — objective facts are never hidden inside a blended score.
9. **JSON robustness for judges.** Request structured output where supported; otherwise allow exactly one schema-focused retry, preserving both raw attempts in `judgment_attempts`. A still-invalid judgment is replaced by the next deterministically selected reserve judge.
10. **Immutable derived scores.** `task_scores` and `bundle_run_scores` are written once when work completes and never mutated. Rankings are computed by query from these immutable rows — no mutable materialized leaderboard.
11. **Durability.** SQLite in WAL mode, prepared statements, one transaction per completed task. `task_results.status` transitions are the checkpoints for resume.
12. **Aggregation.** Task score per candidate×category×trial = **median** of the 3 server-computed judge overalls; **disagreement** = max − min (spread > 3 gets a UI warning flag). Task score across trials = median. Bundle-run total = equal-weight macro-average of all eight category scores.
13. **Safety.** Never execute model-generated code on the application host in v1. Sanitize rendered Markdown; never render candidate HTML. `node:vm`/worker threads are not accepted as security boundaries.

## 6. Plan file index

| File | Module | Covers |
|---|---|---|
| `plans/00-overview.md` | (this file) | Goal, stack, routes, shared contracts, methodology rules, index |
| `plans/01-database.md` | `lib/db.ts` + schema | All CREATE TABLEs, indexes, WAL, migrations, transactions, key queries |
| `plans/02-seed-bundle.md` | `lib/bundles/mini-v1.ts` | Verbatim mini-benchmark-v1 content: wrapper, 8 tasks, judge prompt, schemas, token limits, validator expectations, versioning |
| `plans/03-backend-api.md` | `app/api/**`, `lib/schemas.ts` | All API route handlers, request/response contracts, SSE endpoint + event catalog, Zod payload validation, exports |
| `plans/04-openrouter.md` | `lib/openrouter.ts` | Model list caching, streaming chat client, usage/cost capture, retries, abort |
| `plans/05-run-engine.md` | `lib/run-engine.ts` | Durable state machine, panel assignment, judge orchestration, pause/resume/cancel, checkpoints |
| `plans/06-scoring-judging.md` | `lib/scoring.ts`, `lib/validators/*` | Deterministic validators per category, median/disagreement, server overall, calibration meta-rating, eligibility, cost estimation |
| `plans/07-design-system.md` | `components/ui/*`, design tokens | Visual language, Tailwind tokens, shared UI primitives, motion, accessibility baseline |
| `plans/08-frontend-pages.md` | `app/page.tsx`, `app/models`, `app/bundles`, `app/settings` | Landing, catalog (ModelPicker), bundles, settings pages; settings API routes |
| `plans/09-run-workbench.md` | `app/run`, `app/runs/[id]`, arena components | Four-step setup, arena grid, stream drawer, judge cards, run controls, SSE client |
| `plans/10-leaderboard-analytics.md` | `app/leaderboard`, `app/compare`, `app/judges`, report tab | Leaderboard, compare, judge analytics, run report, chart primitives, export UX |
| `plans/11-testing-verification.md` | tests | Vitest units, integration fixtures, Playwright E2E, accessibility checks |
| `plans/13-bundle-catalog.md` | bundle catalog | Live Octant + Keel inventory, purpose-first instrument naming, future Stylus/Prism |
| `plans/14-keel-bundle.md` | `lib/bundles/keel-v1.ts` | Keel engineering-depth seed; migration 003 |
| `plans/12-env-deployment.md` | ops | Env setup, dependencies, npm scripts, single-process hosting, backups, smoke-run procedure |

## Files to implement

This overview file itself produces no application code, but it governs these shared artifacts (owned by the listed plan files):

- `lib/schemas.ts` — Zod schemas for the SSE events, statuses, and category names defined here (detailed in `plans/03-backend-api.md`)
- Directory skeleton exactly as in §4.6 (scaffolded per `plans/12-env-deployment.md`)
- `.env.local` template as in §2

## Contracts with other modules

- **All plan files** must use the table names (§4.1), statuses (§4.2–4.3), category strings (§4.4), SSE contract (§4.5), and file layout (§4.6) verbatim.
- **01-database** defines the physical schema for the table names listed here; it may add columns but not rename tables or statuses.
- **02-seed-bundle** is the canonical source of prompt text; no other file may restate prompt content.
- **05-run-engine** and **03-backend-api** must emit exactly the SSE events in §4.5; the UI plan (09) consumes only those events plus `GET /api/runs/[id]` snapshots.
- **06-scoring-judging** implements the aggregation and eligibility rules in §5 items 4, 7, 10, 12 without deviation.

## Acceptance criteria

- [ ] Goal, stack table, and env vars match the master plan exactly
- [ ] "One long-running Node process, no serverless" constraint stated with concrete implications
- [ ] All 9 pages and all API routes (the master plan's 11 plus runs list, settings, and test-key) listed with file paths
- [ ] All 13 SQLite table names listed exactly as in the master plan data model (plus the auxiliary `run_events` and `app_settings` tables)
- [ ] The 6 `task_results` statuses (`pending`, `streaming`, `validating`, `judging`, `scored`, `error`) defined with legal transitions
- [ ] All SSE event names defined with concrete payload shapes including event-ID replay semantics
- [ ] The 8 category names listed exactly: roleplay, coding, math, research, marketing, poster, story, judging
- [ ] `lib/` and `components/` layout covers every file from the master plan, with the frontend plans' subdirectory mapping documented (§4.6)
- [ ] All methodology rules present: blind judging, seeded panels + reserve substitution, server-computed overall, temperature-0 judging, no judgment reuse, infra-failure eligibility, immutable derived scores, median/disagreement aggregation
- [ ] Plan file index covers files 01–12 with module ownership
