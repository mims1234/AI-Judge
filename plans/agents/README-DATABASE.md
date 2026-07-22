# Work Order — DATABASE (SQL / Data Foundation)

Track A. You go FIRST. Nothing else can start until your scaffold and schema land.

## Mission

You scaffold the AI Judge repository (Next.js 15 + TypeScript + Tailwind via create-next-app) and build its entire data foundation: the `better-sqlite3` singleton with WAL mode and numbered migrations, the full 13-table physical schema plus auxiliary tables, the seeded immutable `mini-benchmark-v1` prompt bundle, the `.env` contract with fail-fast validation, and the migrate/backup scripts. Every other workload (Backend, Frontend, Quality) builds directly on the files you produce, so exactness of names, statuses, and constraints matters more than anything else.

## Read first (in order)

1. [../00-overview.md](../00-overview.md) — shared vocabulary: tables, statuses, categories, SSE contract, file layout
2. [../01-database.md](../01-database.md) — your primary spec: every CREATE TABLE, index, PRAGMA, migration, key query
3. [../02-seed-bundle.md](../02-seed-bundle.md) — verbatim bundle content for `lib/bundles/mini-v1.ts` (copy-paste, never paraphrase)
4. [../12-env-deployment.md](../12-env-deployment.md) — scaffold command, dependencies, `.env` contract, Windows notes, npm scripts, backup script
5. [../README.md](../README.md) — collision rules and the shared-contract "do not break" list

## You own (create/edit)

Scaffold (per plan 12 §1): run `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir false --import-alias "@/*" --use-npm --turbopack`, then:

- `package.json` — dependency set + scripts block exactly per plan 12 §1.5/§7 (`dev`, `build`, `start`, `test`, `test:watch`, `test:e2e`, `db:migrate`, `db:backup`)
- `tsconfig.json` — `strict`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`
- `.env.example`, `.gitignore`, `.gitattributes` (LF policy; `tests/fixtures/sse/*.sse` marked binary)
- Folder skeleton with `.gitkeep`: `lib/validators/`, `components/`, `tests/{unit,integration,e2e,fixtures}/`, `scripts/`; `data/` is git-ignored and created at boot
- `lib/db.ts` — lazily created `globalThis` singleton; PRAGMAs `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`; `mkdirSync` the `DATABASE_PATH` parent; `migrations` tracking table; append-only migration runner; memoized `prepare()`; shutdown `wal_checkpoint(TRUNCATE)`
- Migration 001 — all 13 tables + all indexes from plan 01 §3–§4, plus the auxiliary tables/columns other plans require (see Shared contracts)
- Migration 002 — seed the `mini-benchmark-v1` bundle row + 8 task rows from `lib/bundles/mini-v1.ts`
- `lib/bundles/mini-v1.ts` — full bundle object (wrapper, 8 verbatim task bodies, extended judge prompt, per-task output schemas + token limits) and `computeContentHash()` per plan 02 §6.1
- `lib/env.ts` — Zod-parses `process.env` for the three env vars, fails fast with a readable message
- `scripts/migrate.ts` (idempotent explicit runner), `scripts/backup.ts` (online `db.backup()` to `data/backups/ai-judge-YYYYMMDD-HHmmss.sqlite`)
- Root `README.md` — setup, Node LTS, `playwright install chromium`, Windows build-tools fallback, backup/restore, serverless prohibition, localhost-only note

## You must NOT touch

- `app/api/**` route files, `lib/schemas.ts`, `lib/api-helpers.ts`, `lib/openrouter.ts`, `lib/run-engine.ts`, `lib/prng.ts`, `lib/scoring.ts`, `lib/validators/**` (Backend)
- `app/` pages and layouts beyond the scaffold defaults, `app/globals.css` content beyond scaffold, `components/**`, `lib/cn.ts`, `lib/format.ts`, `lib/fuzzy.ts`, `lib/client/**` (Frontend)
- `vitest.config.ts`, `playwright.config.ts`, `tests/**` contents, `scripts/record-fixture.ts` (Quality — you only create empty test folders)

## Dependencies

- **Before you:** nothing. You start on an empty workspace.
- **Consumed from you:** Backend imports `lib/db.ts` (singleton + `prepare()`) and relies on your migrations for every table it reads/writes; it also consumes `lib/env.ts` and the seeded bundle rows. Frontend server components read bundles/tasks/scores through `lib/db.ts`. Quality overrides `DATABASE_PATH` to temp files and calls your migration runner from test helpers, and runs `db:migrate`/`db:backup` scripts.
- Other tracks never edit migrations — they request columns via the plan files; you apply them as new numbered migrations.

## Shared contracts (do not break)

- **8 categories (exact, lowercase, CHECK-constrained):** `roleplay, coding, math, research, marketing, poster, story, judging`
- **`task_results.status` CHECK:** `pending, streaming, validating, judging, scored, error`; transitions `pending → streaming → validating → judging → scored`, any non-terminal `→ error`, retry resets `error → pending`
- **`runs.status` CHECK (plan 01 §3.4):** `queued, running, paused, completed, cancelled, incomplete` — matching 00-overview §4.3 and plan 05
- **13 tables (exact snake_case):** `bundles, tasks, models_cache, runs, run_candidates, run_judge_pool, category_judge_panels, task_results, validator_results, judgment_attempts, task_scores, bundle_run_scores, judge_calibration_results`
- **Auxiliary DDL (now in plan 01 §3.14–§3.15):** `run_events` (durable SSE log with AUTOINCREMENT id) and `app_settings` (single-row operator defaults). `models_cache` follows plan 01 §3.3 (`pricing_json` stores normalized prices; `supports_structured_outputs`/`is_free` are derived at read time, per plan 04). `judgment_attempts` substitution/final columns are `is_substitute`/`substituted_for`/`is_final` (plan 01)
- **Math ground truth:** free = **552**, paid = **432** — appears in bundle content/validator expectations only; never derive these anywhere else
- **Blind seeded panels:** `category_judge_panels` persists per-category `panel_seed`, active positions 0–2, and `reserve_order` for deterministic reserve substitution
- **Env vars (exact names):** `OPENROUTER_API_KEY` (server-only; read only in `lib/openrouter.ts`), `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`), `DATABASE_PATH` (default `./data/ai-judge.sqlite`; `lib/db.ts` is its only reader)
- **SSE event names** live in 00-overview §4.5; you only provide the `run_events` table that stores them
- Migrations live in an in-code migration array inside `lib/db.ts`, tracked in a `migrations` table (plan 01; plan 12 defers to it — there is no `migrations/*.sql` folder)

## Definition of done

- [ ] Fresh clone: `npm install` needs no compiler (prebuilt better-sqlite3), `npm run dev` boots, auto-creates `data/ai-judge.sqlite` in WAL mode, fails fast if `OPENROUTER_API_KEY` missing
- [ ] All 13 tables + auxiliary tables created with exact names, CHECK constraints, foreign keys, and every index from plan 01 §4
- [ ] One-transaction-per-completed-task invariant documented in `lib/db.ts` (no `scored` status without its `task_scores` row)
- [ ] Migration runner is append-only, tracked in a `migrations` table; `npm run db:migrate` is idempotent (second run applies zero)
- [ ] `lib/bundles/mini-v1.ts` reproduces plan 02 content byte-for-byte (wrapper, 8 tasks, extended judge prompt, token limits); `computeContentHash()` implements plan 02 §6.1 canonical JSON SHA-256
- [ ] Seed migration 002 inserts one `bundles` row (status `published`) + 8 `tasks` rows with correct categories and token limits
- [ ] `.env.example` committed; `.gitignore` covers `.env*.local`, `data/`, test artifacts; `.gitattributes` enforces LF with SSE fixtures binary
- [ ] `npm run db:backup` produces a valid timestamped SQLite copy while the app runs
- [ ] All npm scripts run in PowerShell — no POSIX-only syntax anywhere in `package.json`
- [ ] `npm run build` passes under `strict` + `noUncheckedIndexedAccess`

## Kickoff prompt

> You are the Database/Foundation agent for AI Judge. Read plans/agents/README-DATABASE.md fully, then plans/00-overview.md, plans/01-database.md, plans/02-seed-bundle.md, and the scaffold/env/tooling sections of plans/12-env-deployment.md. Scaffold the repo with the exact create-next-app invocation from plan 12, then implement exactly the files listed under "You own" in your work order: lib/db.ts with WAL + numbered migrations (001 = all tables + indexes, 002 = seed bundle), lib/bundles/mini-v1.ts with verbatim plan-02 content, lib/env.ts, scripts/migrate.ts, scripts/backup.ts, .env.example, .gitignore, .gitattributes, package.json scripts, tsconfig strict flags, and the root README. Use the exact table names, status CHECK constraints, category strings, and env var names from the shared contracts. Do not create or modify any file owned by the Backend, Frontend, or Quality workloads. If two plan files conflict, fix the plan file first, then code.
