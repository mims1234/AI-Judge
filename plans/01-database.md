# 01 — Database (SQLite via better-sqlite3)

## Purpose and Scope

This file is the complete physical specification of the AI Judge SQLite database: every table, column, constraint, foreign key, and index; the connection/WAL/migration strategy for `lib/db.ts`; transaction conventions; and the key queries the rest of the system depends on (leaderboard ranking, judge stats rollup, run resume, checkpoint recovery).

Shared vocabulary (table names, statuses, categories) comes from `plans/00-overview.md` §4 and is used here verbatim. The seed content inserted into `bundles`/`tasks` is defined in `plans/02-seed-bundle.md`.

Out of scope: query call-sites (owned by the modules that run them), Zod schemas (03), scoring math (06).

---

## 1. Conventions

- **IDs**: `TEXT PRIMARY KEY` holding UUIDv4 strings generated in application code (`crypto.randomUUID()`), except `models_cache` (natural key) and join tables (composite keys). SSE event ordering uses a per-run integer counter, not table rowids.
- **Timestamps**: `INTEGER` Unix epoch **milliseconds** (`Date.now()`). Column names end in `_at`. Nullable when the event may not have happened yet.
- **Booleans**: `INTEGER` 0/1 with `CHECK (col IN (0,1))`.
- **JSON columns**: `TEXT` containing JSON, named `*_json`. Always parsed/validated with Zod at the application boundary; SQLite stores them opaquely.
- **Money**: `REAL` in USD (`*_usd`). Token counts: `INTEGER`.
- **Enums**: `TEXT` + `CHECK` constraints matching exactly the status strings in `plans/00-overview.md`.
- **Foreign keys**: always declared; `PRAGMA foreign_keys = ON` at every connection open. `ON DELETE CASCADE` from runs downward so deleting an abandoned run cleans up; bundles/tasks are never deleted once published.

## 2. Connection setup (`lib/db.ts`)

`lib/db.ts` exports a lazily created **module-level singleton** `Database` instance (safe because we target one long-running Node process). On first open:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;      -- WAL-safe; fsync at checkpoints
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

- Database file path from `process.env.DATABASE_PATH` (default `./data/ai-judge.sqlite`); create the parent directory if missing.
- WAL means readers (API routes, leaderboard queries) never block the single writer (run engine).
- `wal_checkpoint(TRUNCATE)` is run on graceful shutdown (SIGINT/SIGTERM handler).

### Migration strategy

Numbered migrations run at startup inside `lib/db.ts`:

- A `migrations` table: `CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)`.
- Migrations are an ordered in-code array `{ id: number, name: string, up: (db) => void }` — id 1, 2, 3… Each unapplied migration runs inside a single transaction, then its row is inserted into `migrations`. Mismatched or out-of-order applied ids throw at startup.
- Migration 001 creates every table and index in this document. Seeding `mini-benchmark-v1` (bundle + 8 task rows) is migration 002, using the content from `plans/02-seed-bundle.md` via `lib/bundles/mini-v1.ts`.
- Migrations are **append-only**: never edit an applied migration; add a new one.

### Prepared-statement conventions

- Every repeated query is prepared once and cached: `lib/db.ts` exposes `prepare(sql)` that memoizes by SQL string (better-sqlite3 statements are cheap but not free).
- Statement definitions live next to their module (e.g. run-engine queries in `lib/run-engine.ts`), but all go through the shared `db` singleton.
- Use named parameters (`@runId`) rather than positional `?` for any statement with 3+ parameters.
- No string interpolation into SQL, ever. Dynamic filters (e.g. leaderboard category) use fixed SQL variants or parameterized `IN` lists built from validated enum values only.

### One-transaction-per-completed-task rule

When a task result finishes judging, ALL of the following are committed in **one** better-sqlite3 transaction (synchronous, so it is atomic and fast):

1. Final `judgment_attempts` rows (if not already inserted),
2. The `task_scores` row (median, disagreement, server-computed overalls),
3. `task_results.status → 'scored'` and its `output_hash`, usage, cost, latency,
4. The incremental `runs.total_cost_usd` update.

The same pattern applies at run completion: `bundle_run_scores` insert + `runs.status/finished_at` update in one transaction. This guarantees a crash never leaves a `scored` status without its score row (checkpoint recovery relies on this invariant).

## 3. Full schema (migration 001)

### 3.1 `bundles`

```sql
CREATE TABLE bundles (
  id            TEXT PRIMARY KEY,              -- uuid
  name          TEXT NOT NULL,                 -- e.g. 'mini-benchmark'
  version       TEXT NOT NULL,                 -- semver, e.g. '1.0.0'
  slug          TEXT NOT NULL UNIQUE,          -- e.g. 'mini-benchmark-v1'
  content_hash  TEXT NOT NULL,                 -- sha256 of canonical bundle JSON
  status        TEXT NOT NULL DEFAULT 'published'
                CHECK (status IN ('draft','published','deprecated')),
  changelog     TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  UNIQUE (name, version)
);
```

Published bundles are immutable: application code must refuse UPDATEs to `content_hash`, task rows, or prompts of a published bundle. Any change = new bundle row (new version) = new leaderboard scope.

### 3.2 `tasks`

```sql
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,              -- uuid
  bundle_id     TEXT NOT NULL REFERENCES bundles(id),
  category      TEXT NOT NULL
                CHECK (category IN ('roleplay','coding','math','research',
                                    'marketing','poster','story','judging')),
  wrapper       TEXT NOT NULL,                 -- common wrapper text
  task_body     TEXT NOT NULL,                 -- category task text, verbatim
  judge_prompt  TEXT NOT NULL,                 -- full judge prompt template
  output_schema TEXT NOT NULL,                 -- JSON: expected candidate output schema
  token_limit   INTEGER NOT NULL,              -- max_tokens for candidate completion
  weight        REAL NOT NULL DEFAULT 1.0,     -- equal weight in v1
  UNIQUE (bundle_id, category)
);
```

### 3.3 `models_cache`

```sql
CREATE TABLE models_cache (
  openrouter_id   TEXT PRIMARY KEY,            -- e.g. 'anthropic/claude-sonnet-4'
  name            TEXT NOT NULL,
  context_length  INTEGER,
  pricing_json    TEXT NOT NULL,               -- snapshot: prompt/completion USD per token
  raw_json        TEXT NOT NULL,               -- full OpenRouter model object
  fetched_at      INTEGER NOT NULL
);
```

Whole-catalog refresh: if `MAX(fetched_at)` is older than 1 hour, `GET /api/models` re-fetches and upserts all rows in one transaction. Pricing used for cost math is snapshotted per run inside `runs.parameters_json`, so later cache refreshes never rewrite historical costs.

### 3.4 `runs`

```sql
CREATE TABLE runs (
  id               TEXT PRIMARY KEY,           -- uuid
  bundle_id        TEXT NOT NULL REFERENCES bundles(id),
  bundle_hash      TEXT NOT NULL,              -- copy of bundles.content_hash at snapshot time
  seed             INTEGER NOT NULL,           -- panel-selection seed
  status           TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','running','paused',
                                     'completed','cancelled','incomplete')),
  parameters_json  TEXT NOT NULL,              -- trials, concurrency, categories included,
                                               -- temperature, token limits, pricing snapshot,
                                               -- provider routing prefs
  budget_usd       REAL,                       -- NULL = no cap
  trials           INTEGER NOT NULL DEFAULT 1,
  started_at       INTEGER,
  finished_at      INTEGER,
  total_cost_usd   REAL NOT NULL DEFAULT 0,
  last_event_id    INTEGER NOT NULL DEFAULT 0, -- monotonic SSE event counter
  error            TEXT,
  created_at       INTEGER NOT NULL
);
```

The run row plus its `run_candidates`, `run_judge_pool`, `category_judge_panels`, and pre-created `task_results` rows form the **immutable run snapshot** written by `POST /api/runs`.

### 3.5 `run_candidates`

```sql
CREATE TABLE run_candidates (
  run_id    TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  model_id  TEXT NOT NULL,                     -- openrouter_id
  PRIMARY KEY (run_id, model_id)
);
```

### 3.6 `run_judge_pool`

```sql
CREATE TABLE run_judge_pool (
  run_id    TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  model_id  TEXT NOT NULL,
  PRIMARY KEY (run_id, model_id)
);
```

### 3.7 `category_judge_panels`

One row per (run, category, pool member). `panel_position` 0–2 marks the three active panel judges; reserves get `panel_position = NULL` and a `reserve_order` (0 = first reserve). Selection is a deterministic function of `panel_seed` (derived from `runs.seed` + category name).

```sql
CREATE TABLE category_judge_panels (
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  category        TEXT NOT NULL
                  CHECK (category IN ('roleplay','coding','math','research',
                                      'marketing','poster','story','judging')),
  panel_seed      INTEGER NOT NULL,
  judge_model_id  TEXT NOT NULL,
  panel_position  INTEGER CHECK (panel_position IN (0,1,2)),
  reserve_order   INTEGER,                     -- NULL for active panel members
  PRIMARY KEY (run_id, category, judge_model_id),
  CHECK ((panel_position IS NULL) != (reserve_order IS NULL))
);
```

### 3.8 `task_results`

```sql
CREATE TABLE task_results (
  id                  TEXT PRIMARY KEY,        -- uuid
  run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id             TEXT NOT NULL REFERENCES tasks(id),
  candidate_model_id  TEXT NOT NULL,
  trial_index         INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','streaming','validating',
                                        'judging','scored','error')),
  raw_output          TEXT,                    -- full final candidate text
  output_hash         TEXT,                    -- sha256 of raw_output
  request_hash        TEXT,                    -- idempotency: hash(run,task,model,trial,params)
  provider            TEXT,                    -- provider route actually used
  finish_reason       TEXT,
  prompt_tokens       INTEGER,
  completion_tokens   INTEGER,
  cost_usd            REAL,
  latency_ms          INTEGER,
  error               TEXT,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  started_at          INTEGER,
  finished_at         INTEGER,
  UNIQUE (run_id, task_id, candidate_model_id, trial_index)
);
```

All rows for a run are pre-created with `status = 'pending'` at snapshot time (candidates × included tasks × trials), which makes progress totals and resume queries trivial.

### 3.9 `validator_results`

```sql
CREATE TABLE validator_results (
  id              TEXT PRIMARY KEY,            -- uuid
  task_result_id  TEXT NOT NULL REFERENCES task_results(id) ON DELETE CASCADE,
  validator       TEXT NOT NULL,               -- e.g. 'json_parse','required_keys',
                                               -- 'array_counts','word_limit','math_answer'
  passed          INTEGER NOT NULL CHECK (passed IN (0,1)),
  expected_json   TEXT,                        -- what the validator expected
  actual_json     TEXT,                        -- what it found
  details         TEXT NOT NULL DEFAULT '',    -- human-readable explanation
  UNIQUE (task_result_id, validator)
);
```

### 3.10 `judgment_attempts`

Every judge call is a row — including schema-retry attempts and reserve substitutions — so raw evidence is never lost.

```sql
CREATE TABLE judgment_attempts (
  id                     TEXT PRIMARY KEY,     -- uuid
  task_result_id         TEXT NOT NULL REFERENCES task_results(id) ON DELETE CASCADE,
  judge_model_id         TEXT NOT NULL,
  attempt                INTEGER NOT NULL DEFAULT 1,   -- 1 = first try, 2 = schema retry
  is_final               INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0,1)),
                                               -- 1 = the attempt that counts for this judge slot
                                               -- (run-engine resume idempotency, plan 05)
  is_substitute          INTEGER NOT NULL DEFAULT 0 CHECK (is_substitute IN (0,1)),
  substituted_for        TEXT,                 -- original judge_model_id if is_substitute=1
  raw_output             TEXT,                 -- raw judge text
  parsed_json            TEXT,                 -- validated judge JSON (NULL if invalid)
  evidence               TEXT,                 -- structured evidence / parse-error notes
                                               -- (Zod issues for invalid attempts, plan 05)
  parse_status           TEXT NOT NULL
                         CHECK (parse_status IN ('first_try','repaired','invalid')),
  score_correctness      REAL,                 -- extracted sub-scores (NULL if invalid)
  score_compliance       REAL,
  score_quality          REAL,
  score_honesty          REAL,
  claimed_overall        REAL,                 -- judge's own overall_score
  server_overall         REAL,                 -- avg of 4 sub-scores, computed server-side
  verdict                TEXT CHECK (verdict IN ('pass','partial_pass','fail')),
  calibration_score      REAL,                 -- 0-10 judge quality meta-rating
  prompt_tokens          INTEGER,
  completion_tokens      INTEGER,
  cost_usd               REAL,
  latency_ms             INTEGER,
  temperature            REAL NOT NULL DEFAULT 0,
  provider               TEXT,
  created_at             INTEGER NOT NULL
);
```

The three attempts that count for a task carry `is_final = 1` (one per effective judge slot, set by the run engine per `plans/05-run-engine.md`); they are additionally persisted via `task_scores.judgment_ids_json`. The scoring module (06) consumes only these final attempts.

### 3.11 `task_scores`

Immutable derived row, written once in the task-completion transaction.

```sql
CREATE TABLE task_scores (
  id                  TEXT PRIMARY KEY,        -- uuid
  task_result_id      TEXT NOT NULL UNIQUE REFERENCES task_results(id) ON DELETE CASCADE,
  run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id             TEXT NOT NULL REFERENCES tasks(id),
  category            TEXT NOT NULL,
  candidate_model_id  TEXT NOT NULL,
  trial_index         INTEGER NOT NULL,
  judgment_ids_json   TEXT NOT NULL,           -- the 3 final judgment_attempts ids
  judge_overalls_json TEXT NOT NULL,           -- [x, y, z] server-computed overalls
  median_overall      REAL NOT NULL,           -- median of the three
  disagreement        REAL NOT NULL,           -- max - min
  validators_passed   INTEGER NOT NULL,        -- count passed
  validators_total    INTEGER NOT NULL,
  created_at          INTEGER NOT NULL
);
```

### 3.12 `bundle_run_scores`

One immutable row per (run, candidate) when that candidate completes every included category.

```sql
CREATE TABLE bundle_run_scores (
  id                  TEXT PRIMARY KEY,        -- uuid
  run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  bundle_id           TEXT NOT NULL REFERENCES bundles(id),
  candidate_model_id  TEXT NOT NULL,
  complete            INTEGER NOT NULL CHECK (complete IN (0,1)),
                                               -- 1 = all included categories scored
  category_scores_json TEXT NOT NULL,          -- { category: medianAcrossTrials }
  overall_score       REAL,                    -- macro-average of category scores
                                               -- NULL when complete = 0
  total_cost_usd      REAL NOT NULL,
  avg_latency_ms      REAL,
  created_at          INTEGER NOT NULL,
  UNIQUE (run_id, candidate_model_id)
);
```

`complete = 0` rows exist so incomplete runs are visible/auditable but they never enter the main leaderboard (eligibility rule, `plans/00-overview.md` §5.7).

### 3.13 `judge_calibration_results`

```sql
CREATE TABLE judge_calibration_results (
  id               TEXT PRIMARY KEY,           -- uuid
  fixture          TEXT NOT NULL,              -- fixture identifier (human-reviewed set)
  judge_model_id   TEXT NOT NULL,
  evidence_quality REAL,                       -- 0-10
  consistency      REAL,                       -- claimed overall vs sub-scores
  correctness      REAL,                       -- vs human-reviewed expected outcome
  parse_status     TEXT NOT NULL
                   CHECK (parse_status IN ('first_try','repaired','invalid')),
  raw_output       TEXT,
  created_at       INTEGER NOT NULL,
  UNIQUE (fixture, judge_model_id, created_at)
);
```

### 3.14 `run_events`

Durable SSE event log required by `plans/03-backend-api.md` (Last-Event-ID replay) and written only by the run engine. Ephemeral event types (`candidate.delta`, `judge.delta`, `heartbeat`, `resync`) are never inserted here. The AUTOINCREMENT id is global but strictly increasing within any run's stream, which is all SSE replay needs; `runs.last_event_id` mirrors the highest id persisted for that run.

```sql
CREATE TABLE run_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,  -- used as the SSE event id
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                      -- event name per plans/00-overview.md §4.5
  payload     TEXT NOT NULL,                      -- JSON
  created_at  INTEGER NOT NULL
);
```

### 3.15 `app_settings`

Single-row operator defaults consumed by `/settings` and the run wizard (`plans/08-frontend-pages.md` owns the routes):

```sql
CREATE TABLE app_settings (
  id             INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
  settings_json  TEXT NOT NULL,                       -- Zod-validated settings object
  updated_at     INTEGER NOT NULL
);
```

## 4. Indexes

```sql
-- bundles / tasks
CREATE INDEX idx_tasks_bundle           ON tasks(bundle_id);
CREATE INDEX idx_tasks_bundle_category  ON tasks(bundle_id, category);

-- models cache freshness
CREATE INDEX idx_models_fetched         ON models_cache(fetched_at);

-- runs
CREATE INDEX idx_runs_bundle            ON runs(bundle_id);
CREATE INDEX idx_runs_status            ON runs(status);
CREATE INDEX idx_runs_created           ON runs(created_at);

-- task_results (hot paths: engine resume, arena grid, retries)
CREATE INDEX idx_tr_run_status          ON task_results(run_id, status);
CREATE INDEX idx_tr_run_candidate       ON task_results(run_id, candidate_model_id);
CREATE INDEX idx_tr_candidate           ON task_results(candidate_model_id);
CREATE INDEX idx_tr_request_hash        ON task_results(request_hash);
CREATE INDEX idx_tr_finished            ON task_results(finished_at);

-- validators / judgments
CREATE INDEX idx_vr_task_result         ON validator_results(task_result_id);
CREATE INDEX idx_ja_task_result         ON judgment_attempts(task_result_id);
CREATE INDEX idx_ja_judge               ON judgment_attempts(judge_model_id);
CREATE INDEX idx_ja_created             ON judgment_attempts(created_at);

-- derived scores (leaderboard hot path)
CREATE INDEX idx_ts_run                 ON task_scores(run_id);
CREATE INDEX idx_ts_candidate_category  ON task_scores(candidate_model_id, category);
CREATE INDEX idx_brs_bundle_model       ON bundle_run_scores(bundle_id, candidate_model_id, complete);
CREATE INDEX idx_brs_created            ON bundle_run_scores(created_at);

-- panels & calibration
CREATE INDEX idx_cjp_run                ON category_judge_panels(run_id);
CREATE INDEX idx_jcr_judge              ON judge_calibration_results(judge_model_id);

-- SSE replay
CREATE INDEX idx_run_events_run         ON run_events(run_id, id);
```

## 5. Key queries

These are the load-bearing queries; implementers must match their semantics exactly.

### 5.1 Leaderboard ranking (per bundle)

Leaderboard score = **median of complete bundle-run scores** per model; provisional until 3 complete runs. SQLite has no `MEDIAN()`, so use the standard two-middle-rows window trick:

```sql
WITH complete_scores AS (
  SELECT candidate_model_id, overall_score, total_cost_usd, avg_latency_ms, created_at,
         ROW_NUMBER() OVER (PARTITION BY candidate_model_id ORDER BY overall_score) AS rn,
         COUNT(*)    OVER (PARTITION BY candidate_model_id) AS cnt
  FROM bundle_run_scores
  WHERE bundle_id = @bundleId AND complete = 1
),
medians AS (
  SELECT candidate_model_id,
         AVG(overall_score) AS median_score,          -- avg of middle one/two rows
         MAX(cnt)           AS complete_runs
  FROM complete_scores
  WHERE rn IN ((cnt + 1) / 2, (cnt + 2) / 2)
  GROUP BY candidate_model_id
)
SELECT m.candidate_model_id,
       m.median_score,
       m.complete_runs,
       (m.complete_runs < 3)                       AS provisional,
       (SELECT AVG(disagreement) FROM task_scores ts
         JOIN runs r ON r.id = ts.run_id
        WHERE ts.candidate_model_id = m.candidate_model_id
          AND r.bundle_id = @bundleId)             AS avg_disagreement,
       (SELECT AVG(total_cost_usd) FROM bundle_run_scores b
        WHERE b.bundle_id = @bundleId AND b.complete = 1
          AND b.candidate_model_id = m.candidate_model_id) AS avg_cost_usd,
       (SELECT MAX(created_at) FROM bundle_run_scores b
        WHERE b.bundle_id = @bundleId
          AND b.candidate_model_id = m.candidate_model_id) AS last_evaluated_at
FROM medians m
ORDER BY m.median_score DESC, m.complete_runs DESC;
```

Success rate (scored vs error task results) and per-category expansion are companion queries over `task_results` / `task_scores` filtered by the same bundle's runs. Category-scoped leaderboard: same shape but median over per-category values extracted from `task_scores.median_overall` grouped by `(candidate_model_id, category)`.

### 5.2 Judge stats rollup (`/judges`)

```sql
SELECT judge_model_id,
       COUNT(*)                                        AS judgments,
       AVG(CASE WHEN parse_status = 'first_try' THEN 1.0 ELSE 0 END) AS first_try_rate,
       AVG(CASE WHEN parse_status = 'invalid'   THEN 1.0 ELSE 0 END) AS parse_failure_rate,
       AVG(server_overall)                             AS mean_overall,      -- harshness/leniency
       AVG(ABS(claimed_overall - server_overall))      AS overall_mismatch,  -- self-consistency
       AVG(calibration_score)                          AS mean_calibration,
       AVG(cost_usd)                                   AS mean_cost_usd,
       AVG(latency_ms)                                 AS mean_latency_ms
FROM judgment_attempts
WHERE parse_status != 'invalid' OR attempt = 1        -- count failures once
GROUP BY judge_model_id
ORDER BY mean_calibration DESC;
```

Variance (harshness spread) is computed in application code from the same rows (SQLite lacks `STDDEV` without extensions). Per-judge deviation-from-panel-median is a join of `judgment_attempts` to `task_scores` on `task_result_id`, comparing `server_overall` to `median_overall`. Fixture calibration comes from `judge_calibration_results` grouped by `judge_model_id`.

### 5.3 Run resume (skip scored work)

On engine start/resume, fetch only unfinished work in deterministic order:

```sql
SELECT tr.*
FROM task_results tr
JOIN tasks t ON t.id = tr.task_id
WHERE tr.run_id = @runId
  AND tr.status NOT IN ('scored','error')
ORDER BY tr.candidate_model_id, t.category, tr.trial_index;
```

Progress counters for `run.status` SSE events:

```sql
SELECT status, COUNT(*) AS n
FROM task_results
WHERE run_id = @runId
GROUP BY status;
```

### 5.4 Checkpoint recovery (crash cleanup)

At startup, before resuming any run, roll back rows that were mid-flight when the process died. Because `scored` is only ever written in the same transaction as its `task_scores` row, anything stuck in a transient state is safely restartable:

```sql
UPDATE task_results
SET status = 'pending',
    raw_output = NULL, output_hash = NULL,
    error = NULL, started_at = NULL
WHERE run_id = @runId
  AND status IN ('streaming','validating','judging');
```

Then orphaned partial artifacts from those reset rows are removed:

```sql
DELETE FROM validator_results
WHERE task_result_id IN (SELECT id FROM task_results WHERE run_id = @runId AND status = 'pending');
DELETE FROM judgment_attempts
WHERE task_result_id IN (SELECT id FROM task_results WHERE run_id = @runId AND status = 'pending');
```

(Deleting these partial judgments is correct — judgments are never reused across attempts of the same trial, and completed trials are untouched because their status is `scored`.) Runs found in `running` at startup keep their status and are re-enqueued first by the run engine's boot recovery (`plans/05-run-engine.md` § Architecture); `paused` runs stay paused until the operator resumes them.

Idempotency check before any billable candidate call:

```sql
SELECT id, status FROM task_results
WHERE request_hash = @requestHash AND run_id = @runId AND status = 'scored';
```

A hit means this exact request already completed in this run — skip the duplicate call (but never match across runs/trials: the hash includes run id and trial index).

## 6. Size hygiene

- Persist only the **final** candidate/judge text, never per-token deltas.
- `runs.parameters_json` snapshots pricing so `models_cache` can be refreshed freely.
- Optional maintenance (settings page, out of hot path): `VACUUM` and deleting `cancelled`/`failed` runs older than a configurable age.

## Files to implement

- `lib/db.ts` — singleton connection, PRAGMAs, `migrations` table, migration runner, memoized `prepare()`, shutdown checkpoint, startup recovery hook (§5.4 invoked by run engine)
- Migration 001 (in `lib/db.ts` migration array) — all tables in §3 + all indexes in §4
- Migration 002 — seed `mini-benchmark-v1` bundle + 8 tasks from `lib/bundles/mini-v1.ts` (content per `plans/02-seed-bundle.md`)

## Contracts with other modules

- **02-seed-bundle**: provides the exact wrapper/task/judge-prompt/output-schema/token-limit content inserted into `bundles` + `tasks`; `content_hash` algorithm defined there.
- **04-openrouter**: writes `models_cache`; reads pricing for cost math; supplies `provider`, token usage, `finish_reason` persisted on `task_results` and `judgment_attempts`.
- **06-scoring-judging (validators)**: writes `validator_results` via the engine (one row per validator, unique per task result); the `validator` name strings it uses are its contract.
- **05-run-engine**: sole writer of `runs.status`, `task_results`, `judgment_attempts`, panels, and `run_events` during execution; must follow the status transitions (00 §4.2), the one-transaction-per-completed-task rule (§2), resume (§5.3) and recovery (§5.4) queries.
- **06-scoring-judging**: computes the values written to `task_scores` / `bundle_run_scores` / `calibration_score`; consumes §5.1–5.2 queries.
- **03-backend-api**: read-only consumer of everything plus writer of run snapshots (`POST /api/runs`) and `models_cache`; uses §5.1 for `/api/leaderboard`; reads `run_events` for SSE replay.
- **08-frontend-pages**: reads/writes `app_settings` via `GET/PUT /api/settings`.
- **11-testing-verification**: transaction-recovery tests assert the §5.4 invariant (no `scored` without `task_scores`).

## Acceptance criteria

- [ ] All 13 tables from the master plan (plus auxiliary `run_events` and `app_settings`) have full `CREATE TABLE` statements with types, CHECK constraints, and foreign keys
- [ ] `task_results.status` CHECK matches exactly: pending/streaming/validating/judging/scored/error
- [ ] Category CHECK constraints match the 8 canonical category strings
- [ ] Indexes cover bundle, model, category, run status, and timestamps (all listed in §4)
- [ ] WAL mode, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout` specified for every connection
- [ ] Numbered append-only migrations run at startup in `lib/db.ts`, tracked in a `migrations` table; seed bundle is migration 002
- [ ] Prepared-statement memoization and named-parameter conventions documented; no SQL string interpolation
- [ ] One-transaction-per-completed-task rule defined with its exact member writes, plus the run-completion transaction
- [ ] Leaderboard median query (median of complete bundle-run scores, provisional < 3 runs) spelled out
- [ ] Judge stats rollup query (first-try rate, parse failure rate, harshness, claimed-vs-server mismatch, calibration) spelled out
- [ ] Run-resume query returns only non-terminal work in deterministic order
- [ ] Checkpoint recovery resets transient statuses, purges orphaned partial artifacts, and preserves all `scored` work
- [ ] Idempotency lookup by `request_hash` scoped to run+trial (no cross-run/trial reuse)
- [ ] `task_scores` and `bundle_run_scores` documented as write-once immutable; incomplete runs excluded from the main leaderboard
