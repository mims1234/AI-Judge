# Work Order — BACKEND (API, OpenRouter, Run Engine, Scoring)

Tracks B + C combined. Starts after the Database workload lands.

## Mission

You build everything between the SQLite foundation and the browser: all 11 HTTP API routes with Zod-validated contracts, the SSE stream with durable `Last-Event-ID` replay, the sole OpenRouter client (catalog cache, streaming chat, retries, cost capture), the durable run-engine state machine (seeded blind judge panels, checkpoints, pause/resume/cancel, budget cap, crash recovery), and the deterministic validators plus the full scoring/calibration pipeline. Your API and SSE shapes are frozen contracts the Frontend builds against, so implement them exactly as specified.

## Read first (in order)

1. [../00-overview.md](../00-overview.md) — shared vocabulary: tables, statuses, categories, SSE contract, methodology rules
2. [../03-backend-api.md](../03-backend-api.md) — every route contract, error envelope, SSE wire protocol, `run_events`
3. [../04-openrouter.md](../04-openrouter.md) — `lib/openrouter.ts`: catalog, streaming, retries, key handling
4. [../05-run-engine.md](../05-run-engine.md) — engine state machine, panel selection, judging pipeline, recovery
5. [../06-scoring-judging.md](../06-scoring-judging.md) — validators, score math, judge calibration, cost estimation
6. [../README.md](../README.md) — collision rules and the shared-contract "do not break" list

## You own (create/edit)

API layer (plan 03):
- `app/api/models/route.ts`
- `app/api/runs/route.ts` (POST create + GET list with `?status=` filter)
- `app/api/runs/preflight/route.ts`
- `app/api/runs/[id]/route.ts`
- `app/api/runs/[id]/events/route.ts` (SSE)
- `app/api/runs/[id]/pause/route.ts`, `.../resume/route.ts`, `.../cancel/route.ts`
- `app/api/runs/[id]/tasks/[taskId]/retry/route.ts`
- `app/api/leaderboard/route.ts`
- `app/api/runs/[id]/export/route.ts`
- `lib/schemas.ts` — all named Zod schemas from plan 03 plus plan 04's `OpenRouterModelSchema`/`judgeOutputJsonSchema` and plan 06's `JudgeOutputSchema`
- `lib/api-helpers.ts` — error envelope helper, Zod parse wrapper, SSE frame writer

OpenRouter client (plan 04):
- `lib/openrouter.ts` — `hasApiKey`, `checkKeyStatus`, `getModelCatalog`, `getCachedModel`, `streamChat`, `OpenRouterError`, SSE parser, retry helper

Run engine (plan 05):
- `lib/run-engine.ts` — `getRunEngine`, `selectPanels`, executor, control block, recovery, judging pipeline, blindness assertion, budget gate, event emission
- `lib/prng.ts` — `hash32` (FNV-1a), `mulberry32`, `seededShuffle`

Validators & scoring (plan 06):
- `lib/validators/common.ts`, `lib/validators/math.ts`, `lib/validators/index.ts`
- `lib/scoring.ts` — `renderValidatorBlock`, `aggregateTask`, `finalizeRun`, `queryLeaderboard`, `judgeMetaScore`, `runCalibration`, `estimateRunCost`, `estimateTaskCost`
- `lib/fixtures/calibration/*.json` — human-reviewed calibration fixture set

## You must NOT touch

- `lib/db.ts`, migrations, `lib/bundles/mini-v1.ts`, `lib/env.ts`, `scripts/migrate.ts`, `scripts/backup.ts`, `package.json`, `tsconfig.json` (Database). Need a column or table (e.g. `run_events`, `is_final`)? Get it added via the plan files / Database workload — never edit migrations yourself
- `app/**/page.tsx`, `app/layout.tsx`, `app/globals.css`, all `loading.tsx`/`error.tsx`, `components/**`, `lib/cn.ts`, `lib/format.ts`, `lib/fuzzy.ts`, `lib/client/**` (Frontend). Note `app/api/settings/route.ts` and `app/api/settings/test-key/route.ts` are owned by Frontend (plan 08) — not yours
- `vitest.config.ts`, `playwright.config.ts`, `tests/**` (Quality)

## Dependencies

- **Before you start:** Database workload must have landed: repo scaffold, `lib/db.ts` + migrations (all 13 tables, `run_events`, indexes), the seeded bundle, and `lib/env.ts`.
- **You consume:** `lib/db.ts` (singleton, `prepare()`), the frozen run snapshot in `runs.parameters_json`, seeded `bundles`/`tasks` rows, `lib/env.ts`. Only `lib/openrouter.ts` reads `OPENROUTER_API_KEY`; only the engine calls `streamChat`.
- **Others consume from you:** Frontend consumes your route responses (`RunSnapshotSchema`, `LeaderboardResponseSchema`, …) and SSE events exactly as plan 03 specifies, and imports types from `lib/schemas.ts` (read-only). Quality drives `lib/run-engine.ts` and `lib/openrouter.ts` against a mock server — so `OPENROUTER_BASE_URL` must be read at call time, panel selection must be exported as pure functions, and scoring math must be pure/injectable.

## Shared contracts (do not break)

- **8 categories (exact, lowercase):** `roleplay, coding, math, research, marketing, poster, story, judging` — canonical processing order for the executor
- **`task_results.status`:** `pending → streaming → validating → judging → scored`; any non-terminal `→ error`; retry resets `error → pending`. Every phase exit persists payload + status in ONE transaction
- **Run statuses:** engine lifecycle per plan 05 — `queued, running, paused` and terminals `completed / cancelled / incomplete`; infrastructure failures produce `error` tasks and `incomplete` runs, NEVER zero scores
- **SSE contract:** 00-overview §4.5 is the canonical event catalog, and plans 03/05/09 restate it verbatim (`run.status`, `task.status`, `candidate.delta`, `candidate.complete`, `validation.complete`, `judge.started`, `judge.delta`, `judge.complete`, `task.scored`, `run.cost`, `notice`, `run.complete`, `resync`, `heartbeat`); persisted events get monotonic integer ids from `run_events`, ephemeral events (`candidate.delta`, `judge.delta`, `heartbeat`, `resync`) carry no `id:`, `heartbeat` is a named event every 15s, `?lastEventId=` and `Last-Event-ID` replay. The engine and SSE route must emit this ONE vocabulary, byte-identical to what `lib/schemas.ts` `SseEventSchema` declares
- **Table names (exact):** `bundles, tasks, models_cache, runs, run_candidates, run_judge_pool, category_judge_panels, task_results, validator_results, judgment_attempts, task_scores, bundle_run_scores, judge_calibration_results` + `run_events`
- **Math ground truth:** `computeMathGroundTruth()` returns exactly `{ free: 552, paid: 432 }`; strict equality, derived nowhere else
- **Blind seeded panels:** per-category `panel_seed = hash32(seed + ":" + category)`, seeded Fisher-Yates over the pool, positions 0–2 active + `reserve_order` reserves; judge prompts NEVER contain candidate identity (runtime assertion required); self-judging panel member swapped for first eligible seeded reserve for that candidate only, recorded via `is_substitute`/`substituted_for`; invalid judge JSON: one schema retry, then reserve replacement, all attempts persisted
- **Scoring:** `computed_overall` = mean of the 4 sub-scores; task = median of 3 computed overalls; `disagreement` = max − min, flagged > 3; trials collapse by median; bundle run = equal-weight macro-average of 8 categories; leaderboard = median of complete bundle-run scores, provisional < 3 runs
- **Env vars:** `OPENROUTER_API_KEY` (read only in `lib/openrouter.ts`, never logged/exported), `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`, read at call time), `DATABASE_PATH` (only `lib/db.ts` reads it)
- All routes: `export const runtime = "nodejs"`, dynamic routes `force-dynamic`; error envelope `{ error: { code, message, details } }` with plan 03's code table

## Definition of done

- [ ] All 11 route files exist, Node runtime, Zod-validate input via the named schemas in `lib/schemas.ts`; non-2xx responses use the error envelope
- [ ] `GET /api/models`: <1h cache serve, stale-while-revalidate, stale fallback on upstream failure; pricing normalized to USD/M tokens
- [ ] Preflight blocks on missing models / small context / undersized judge pool; emits `SELF_JUDGING_OVERLAP` warnings; `POST /api/runs` re-validates and writes the full immutable snapshot (run + candidates + pool + panels + pending task_results) in one transaction, then enqueues
- [ ] SSE route replays persisted events > cursor then streams live, no gaps or duplicates; token events never persisted; correct after process restart
- [ ] `streamChat` handles split frames, keep-alives, mid-stream errors, missing usage (pricing fallback + `usage_estimated`), abort, 90s idle watchdog; retries max 3 with backoff + `Retry-After`; parameter-rejection fallback with `degraded_params`
- [ ] Engine: `globalThis` singleton, FIFO one-run-at-a-time, boot recovery (reset `streaming → pending`, resume idempotently), pause finishes current phase, cancel aborts via AbortController, budget gate before each dispatch (`BUDGET_CAP_REACHED` → `incomplete`)
- [ ] `selectPanels` deterministic (same seed/pool/categories → byte-identical panels) with the soft family-diversity post-pass; blindness assertion throws if any candidate id or suffix appears in judge messages
- [ ] Validators pure/deterministic: universal chain + poster < 65 words, story 500–700 inclusive, roleplay exactly 3+5, coding shape-only (no execution), math strict 552/432
- [ ] `aggregateTask` / `finalizeRun` / `queryLeaderboard` implement the scoring rules above; `task_scores`/`bundle_run_scores` written once, immutable
- [ ] Judge meta-score implements the four weighted components; calibration fixtures ship and `runCalibration` writes `judge_calibration_results`
- [ ] Export JSON includes all judgment attempts + `export_meta`; CSV matches the documented columns with RFC 4180 quoting (formula-leading cells neutralized)

## Kickoff prompt

> You are the Backend agent for AI Judge. The Database workload has already scaffolded the repo and delivered lib/db.ts, migrations, the seeded mini-benchmark-v1 bundle, and lib/env.ts. Read plans/agents/README-BACKEND.md fully, then plans/00-overview.md, plans/03-backend-api.md, plans/04-openrouter.md, plans/05-run-engine.md, and plans/06-scoring-judging.md. Implement exactly the files listed under "You own" in your work order: all 11 app/api routes, lib/schemas.ts, lib/api-helpers.ts, lib/openrouter.ts, lib/run-engine.ts, lib/prng.ts, lib/validators/*, lib/scoring.ts, and the calibration fixtures. Respect every shared contract: exact category strings, status transitions, one-transaction-per-phase checkpoints, blind seeded panels with reserve substitution, math ground truth 552/432, infrastructure failures never scored as zero, and the SSE event catalog with Last-Event-ID replay. Consume lib/db.ts read-only via its public API and never edit migrations — request schema changes through the plan files. Do not create or modify Frontend pages/components or Quality test files. If plan files conflict (e.g. SSE event naming between 00/03/09), fix the plan files first, then code.
