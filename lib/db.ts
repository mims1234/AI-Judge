import "server-only";

import type BetterSqlite3 from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { KEEL_V1, keelContentHash } from "@/lib/bundles/keel-v1";
import { MINI_V1, computeContentHash } from "@/lib/bundles/mini-v1";

/**
 * SQLite foundation for AI Judge.
 *
 * Invariant — one-transaction-per-completed-task (plans/01-database.md §2):
 * When a task result finishes judging, ALL of the following MUST commit in one
 * better-sqlite3 transaction:
 *   1. Final judgment_attempts rows (if not already inserted)
 *   2. The task_scores row (median, disagreement, server-computed overalls)
 *   3. task_results.status → 'scored' plus output_hash / usage / cost / latency
 *   4. Incremental runs.total_cost_usd update
 * Same pattern at run completion: bundle_run_scores insert + runs.status/finished_at
 * in one transaction. A crash must never leave status='scored' without its
 * task_scores row — checkpoint recovery relies on this.
 *
 * Prepared statements: use prepare(sql) for memoized statements; prefer named
 * parameters (@runId) for 3+ params; never interpolate SQL strings.
 *
 * better-sqlite3 is loaded via require() at open time (not a static ESM import)
 * so Next/Webpack does not try to bundle the native addon into instrumentation.
 */

type Database = BetterSqlite3.Database;
type Statement = BetterSqlite3.Statement;
type DatabaseConstructor = typeof BetterSqlite3;

function loadDatabaseCtor(): DatabaseConstructor {
  // Native addon — must resolve from node_modules at runtime (serverExternalPackages).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("better-sqlite3") as DatabaseConstructor;
}

type Migration = {
  id: number;
  name: string;
  up: (db: Database) => void;
};

type GlobalDb = {
  __aiJudgeDb?: Database;
  __aiJudgeStmtCache?: Map<string, Statement>;
  __aiJudgeShutdownBound?: boolean;
};

const g = globalThis as typeof globalThis & GlobalDb;

function resolveDbPath(): string {
  const envPath = getEnv().DATABASE_PATH;
  return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
}

function openDatabase(): Database {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const DatabaseCtor = loadDatabaseCtor();
  const db = new DatabaseCtor(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  ensureMigrationsTable(db);
  runMigrations(db);
  bindShutdown(db);

  return db;
}

function ensureMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
}

function migration001(db: Database): void {
  db.exec(`
    CREATE TABLE bundles (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      version       TEXT NOT NULL,
      slug          TEXT NOT NULL UNIQUE,
      content_hash  TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'published'
                    CHECK (status IN ('draft','published','deprecated')),
      changelog     TEXT NOT NULL DEFAULT '',
      created_at    INTEGER NOT NULL,
      UNIQUE (name, version)
    );

    CREATE TABLE tasks (
      id            TEXT PRIMARY KEY,
      bundle_id     TEXT NOT NULL REFERENCES bundles(id),
      category      TEXT NOT NULL
                    CHECK (category IN ('roleplay','coding','math','research',
                                        'marketing','poster','story','judging')),
      wrapper       TEXT NOT NULL,
      task_body     TEXT NOT NULL,
      judge_prompt  TEXT NOT NULL,
      output_schema TEXT NOT NULL,
      token_limit   INTEGER NOT NULL,
      weight        REAL NOT NULL DEFAULT 1.0,
      UNIQUE (bundle_id, category)
    );

    CREATE TABLE models_cache (
      openrouter_id   TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      context_length  INTEGER,
      pricing_json    TEXT NOT NULL,
      raw_json        TEXT NOT NULL,
      fetched_at      INTEGER NOT NULL
    );

    CREATE TABLE runs (
      id               TEXT PRIMARY KEY,
      bundle_id        TEXT NOT NULL REFERENCES bundles(id),
      bundle_hash      TEXT NOT NULL,
      seed             INTEGER NOT NULL,
      status           TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','running','paused',
                                         'completed','cancelled','incomplete')),
      parameters_json  TEXT NOT NULL,
      budget_usd       REAL,
      trials           INTEGER NOT NULL DEFAULT 1,
      started_at       INTEGER,
      finished_at      INTEGER,
      total_cost_usd   REAL NOT NULL DEFAULT 0,
      last_event_id    INTEGER NOT NULL DEFAULT 0,
      error            TEXT,
      created_at       INTEGER NOT NULL
    );

    CREATE TABLE run_candidates (
      run_id    TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      model_id  TEXT NOT NULL,
      PRIMARY KEY (run_id, model_id)
    );

    CREATE TABLE run_judge_pool (
      run_id    TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      model_id  TEXT NOT NULL,
      PRIMARY KEY (run_id, model_id)
    );

    CREATE TABLE category_judge_panels (
      run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      category        TEXT NOT NULL
                      CHECK (category IN ('roleplay','coding','math','research',
                                          'marketing','poster','story','judging')),
      panel_seed      INTEGER NOT NULL,
      judge_model_id  TEXT NOT NULL,
      panel_position  INTEGER CHECK (panel_position IN (0,1,2)),
      reserve_order   INTEGER,
      PRIMARY KEY (run_id, category, judge_model_id),
      CHECK ((panel_position IS NULL) != (reserve_order IS NULL))
    );

    CREATE TABLE task_results (
      id                  TEXT PRIMARY KEY,
      run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      task_id             TEXT NOT NULL REFERENCES tasks(id),
      candidate_model_id  TEXT NOT NULL,
      trial_index         INTEGER NOT NULL DEFAULT 0,
      status              TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','streaming','validating',
                                            'judging','scored','error')),
      raw_output          TEXT,
      output_hash         TEXT,
      request_hash        TEXT,
      provider            TEXT,
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

    CREATE TABLE validator_results (
      id              TEXT PRIMARY KEY,
      task_result_id  TEXT NOT NULL REFERENCES task_results(id) ON DELETE CASCADE,
      validator       TEXT NOT NULL,
      passed          INTEGER NOT NULL CHECK (passed IN (0,1)),
      expected_json   TEXT,
      actual_json     TEXT,
      details         TEXT NOT NULL DEFAULT '',
      UNIQUE (task_result_id, validator)
    );

    CREATE TABLE judgment_attempts (
      id                     TEXT PRIMARY KEY,
      task_result_id         TEXT NOT NULL REFERENCES task_results(id) ON DELETE CASCADE,
      judge_model_id         TEXT NOT NULL,
      attempt                INTEGER NOT NULL DEFAULT 1,
      is_final               INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0,1)),
      is_substitute          INTEGER NOT NULL DEFAULT 0 CHECK (is_substitute IN (0,1)),
      substituted_for        TEXT,
      raw_output             TEXT,
      parsed_json            TEXT,
      evidence               TEXT,
      parse_status           TEXT NOT NULL
                             CHECK (parse_status IN ('first_try','repaired','invalid')),
      score_correctness      REAL,
      score_compliance       REAL,
      score_quality          REAL,
      score_honesty          REAL,
      claimed_overall        REAL,
      server_overall         REAL,
      verdict                TEXT CHECK (verdict IN ('pass','partial_pass','fail')),
      calibration_score      REAL,
      prompt_tokens          INTEGER,
      completion_tokens      INTEGER,
      cost_usd               REAL,
      latency_ms             INTEGER,
      temperature            REAL NOT NULL DEFAULT 0,
      provider               TEXT,
      created_at             INTEGER NOT NULL
    );

    CREATE TABLE task_scores (
      id                  TEXT PRIMARY KEY,
      task_result_id      TEXT NOT NULL UNIQUE REFERENCES task_results(id) ON DELETE CASCADE,
      run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      task_id             TEXT NOT NULL REFERENCES tasks(id),
      category            TEXT NOT NULL,
      candidate_model_id  TEXT NOT NULL,
      trial_index         INTEGER NOT NULL,
      judgment_ids_json   TEXT NOT NULL,
      judge_overalls_json TEXT NOT NULL,
      median_overall      REAL NOT NULL,
      disagreement        REAL NOT NULL,
      validators_passed   INTEGER NOT NULL,
      validators_total    INTEGER NOT NULL,
      created_at          INTEGER NOT NULL
    );

    CREATE TABLE bundle_run_scores (
      id                   TEXT PRIMARY KEY,
      run_id               TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      bundle_id            TEXT NOT NULL REFERENCES bundles(id),
      candidate_model_id   TEXT NOT NULL,
      complete             INTEGER NOT NULL CHECK (complete IN (0,1)),
      category_scores_json TEXT NOT NULL,
      overall_score        REAL,
      total_cost_usd       REAL NOT NULL,
      avg_latency_ms       REAL,
      created_at           INTEGER NOT NULL,
      UNIQUE (run_id, candidate_model_id)
    );

    CREATE TABLE judge_calibration_results (
      id               TEXT PRIMARY KEY,
      fixture          TEXT NOT NULL,
      judge_model_id   TEXT NOT NULL,
      evidence_quality REAL,
      consistency      REAL,
      correctness      REAL,
      parse_status     TEXT NOT NULL
                       CHECK (parse_status IN ('first_try','repaired','invalid')),
      raw_output       TEXT,
      created_at       INTEGER NOT NULL,
      UNIQUE (fixture, judge_model_id, created_at)
    );

    CREATE TABLE run_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      payload     TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE app_settings (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      settings_json  TEXT NOT NULL,
      updated_at     INTEGER NOT NULL
    );

    CREATE INDEX idx_tasks_bundle           ON tasks(bundle_id);
    CREATE INDEX idx_tasks_bundle_category  ON tasks(bundle_id, category);
    CREATE INDEX idx_models_fetched         ON models_cache(fetched_at);
    CREATE INDEX idx_runs_bundle            ON runs(bundle_id);
    CREATE INDEX idx_runs_status            ON runs(status);
    CREATE INDEX idx_runs_created           ON runs(created_at);
    CREATE INDEX idx_tr_run_status          ON task_results(run_id, status);
    CREATE INDEX idx_tr_run_candidate       ON task_results(run_id, candidate_model_id);
    CREATE INDEX idx_tr_candidate           ON task_results(candidate_model_id);
    CREATE INDEX idx_tr_request_hash        ON task_results(request_hash);
    CREATE INDEX idx_tr_finished            ON task_results(finished_at);
    CREATE INDEX idx_vr_task_result         ON validator_results(task_result_id);
    CREATE INDEX idx_ja_task_result         ON judgment_attempts(task_result_id);
    CREATE INDEX idx_ja_judge               ON judgment_attempts(judge_model_id);
    CREATE INDEX idx_ja_created             ON judgment_attempts(created_at);
    CREATE INDEX idx_ts_run                 ON task_scores(run_id);
    CREATE INDEX idx_ts_candidate_category  ON task_scores(candidate_model_id, category);
    CREATE INDEX idx_brs_bundle_model       ON bundle_run_scores(bundle_id, candidate_model_id, complete);
    CREATE INDEX idx_brs_created            ON bundle_run_scores(created_at);
    CREATE INDEX idx_cjp_run                ON category_judge_panels(run_id);
    CREATE INDEX idx_jcr_judge              ON judge_calibration_results(judge_model_id);
    CREATE INDEX idx_run_events_run         ON run_events(run_id, id);
  `);
}

function migration002(db: Database): void {
  const now = Date.now();
  const bundleId = crypto.randomUUID();
  const contentHash = computeContentHash(MINI_V1);

  const insertBundle = db.prepare(`
    INSERT INTO bundles (
      id, name, version, slug, content_hash, status, changelog, created_at
    ) VALUES (
      @id, @name, @version, @slug, @content_hash, @status, @changelog, @created_at
    )
  `);

  const insertTask = db.prepare(`
    INSERT INTO tasks (
      id, bundle_id, category, wrapper, task_body, judge_prompt,
      output_schema, token_limit, weight
    ) VALUES (
      @id, @bundle_id, @category, @wrapper, @task_body, @judge_prompt,
      @output_schema, @token_limit, @weight
    )
  `);

  insertBundle.run({
    id: bundleId,
    name: MINI_V1.name,
    version: MINI_V1.version,
    slug: MINI_V1.slug,
    content_hash: contentHash,
    status: MINI_V1.status,
    changelog: MINI_V1.changelog,
    created_at: now,
  });

  for (const task of MINI_V1.tasks) {
    insertTask.run({
      id: crypto.randomUUID(),
      bundle_id: bundleId,
      category: task.category,
      wrapper: MINI_V1.wrapper,
      task_body: task.task_body,
      judge_prompt: task.judge_prompt,
      output_schema: JSON.stringify(task.output_schema),
      token_limit: task.token_limit,
      weight: task.weight,
    });
  }
}

function migration003(db: Database): void {
  const now = Date.now();
  const bundleId = crypto.randomUUID();
  const contentHash = keelContentHash();

  const insertBundle = db.prepare(`
    INSERT INTO bundles (
      id, name, version, slug, content_hash, status, changelog, created_at
    ) VALUES (
      @id, @name, @version, @slug, @content_hash, @status, @changelog, @created_at
    )
  `);

  const insertTask = db.prepare(`
    INSERT INTO tasks (
      id, bundle_id, category, wrapper, task_body, judge_prompt,
      output_schema, token_limit, weight
    ) VALUES (
      @id, @bundle_id, @category, @wrapper, @task_body, @judge_prompt,
      @output_schema, @token_limit, @weight
    )
  `);

  insertBundle.run({
    id: bundleId,
    name: KEEL_V1.name,
    version: KEEL_V1.version,
    slug: KEEL_V1.slug,
    content_hash: contentHash,
    status: KEEL_V1.status,
    changelog: KEEL_V1.changelog,
    created_at: now,
  });

  for (const task of KEEL_V1.tasks) {
    insertTask.run({
      id: crypto.randomUUID(),
      bundle_id: bundleId,
      category: task.category,
      wrapper: KEEL_V1.wrapper,
      task_body: task.task_body,
      judge_prompt: task.judge_prompt,
      output_schema: JSON.stringify(task.output_schema),
      token_limit: task.token_limit,
      weight: task.weight,
    });
  }
}

/**
 * Chat playground (plans/16 §B3): free multi-turn chat sessions judged as a
 * whole. Category is decided by judge consensus at first judging and locks;
 * re-judging appends a new round to chat_judgments.
 */
function migration004(db: Database): void {
  db.exec(`
    CREATE TABLE chat_sessions (
      id                  TEXT PRIMARY KEY,
      candidate_model_id  TEXT NOT NULL,
      judge_pool_json     TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','streaming','judging',
                                            'judged','error')),
      category            TEXT
                          CHECK (category IS NULL OR category IN
                            ('roleplay','coding','math','research','marketing',
                             'poster','story','judging','general')),
      median_score        REAL,
      disagreement        REAL,
      judging_rounds      INTEGER NOT NULL DEFAULT 0,
      total_cost_usd      REAL NOT NULL DEFAULT 0,
      error               TEXT,
      last_event_id       INTEGER NOT NULL DEFAULT 0,
      created_at          INTEGER NOT NULL,
      finished_at         INTEGER
    );

    CREATE TABLE chat_messages (
      id                TEXT PRIMARY KEY,
      session_id        TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role              TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content           TEXT NOT NULL,
      prompt_tokens     INTEGER,
      completion_tokens INTEGER,
      cost_usd          REAL,
      latency_ms        INTEGER,
      created_at        INTEGER NOT NULL
    );

    CREATE TABLE chat_judgments (
      id                  TEXT PRIMARY KEY,
      session_id          TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      round               INTEGER NOT NULL,
      judge_model_id      TEXT NOT NULL,
      predicted_category  TEXT
                          CHECK (predicted_category IS NULL OR predicted_category IN
                            ('roleplay','coding','math','research','marketing',
                             'poster','story','judging','general')),
      category_confidence REAL,
      category_rationale  TEXT,
      raw_output          TEXT,
      parsed_json         TEXT,
      parse_status        TEXT NOT NULL
                          CHECK (parse_status IN ('first_try','repaired','invalid')),
      score_correctness   REAL,
      score_compliance    REAL,
      score_quality       REAL,
      score_honesty       REAL,
      claimed_overall     REAL,
      server_overall      REAL,
      verdict             TEXT CHECK (verdict IN ('pass','partial_pass','fail')),
      prompt_tokens       INTEGER,
      completion_tokens   INTEGER,
      cost_usd            REAL,
      latency_ms          INTEGER,
      created_at          INTEGER NOT NULL,
      UNIQUE (session_id, round, judge_model_id)
    );

    CREATE TABLE chat_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      payload     TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX idx_chat_sessions_candidate ON chat_sessions(candidate_model_id, category);
    CREATE INDEX idx_chat_sessions_status    ON chat_sessions(status);
    CREATE INDEX idx_chat_sessions_finished  ON chat_sessions(finished_at);
    CREATE INDEX idx_chat_messages_session   ON chat_messages(session_id, created_at);
    CREATE INDEX idx_chat_judgments_session  ON chat_judgments(session_id, round);
    CREATE INDEX idx_chat_judgments_judge    ON chat_judgments(judge_model_id);
    CREATE INDEX idx_chat_events_session     ON chat_events(session_id, id);
  `);
}

/** Append-only migration list. Never edit an applied migration — add a new one. */
const MIGRATIONS: Migration[] = [
  { id: 1, name: "001_initial_schema", up: migration001 },
  { id: 2, name: "002_seed_mini_benchmark_v1", up: migration002 },
  { id: 3, name: "003_seed_keel_v1", up: migration003 },
  { id: 4, name: "004_chat_playground", up: migration004 },
];

function runMigrations(db: Database): void {
  const applied = db
    .prepare("SELECT id, name FROM migrations ORDER BY id ASC")
    .all() as Array<{ id: number; name: string }>;

  for (let i = 0; i < applied.length; i++) {
    const row = applied[i];
    const expected = MIGRATIONS[i];
    if (!row || !expected || row.id !== expected.id || row.name !== expected.name) {
      throw new Error(
        `Migration history mismatch at position ${i}: ` +
          `applied=${row ? `${row.id}:${row.name}` : "none"}, ` +
          `expected=${expected ? `${expected.id}:${expected.name}` : "none"}`,
      );
    }
  }

  const nextIndex = applied.length;
  for (let i = nextIndex; i < MIGRATIONS.length; i++) {
    const migration = MIGRATIONS[i];
    if (!migration) continue;

    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare(
        "INSERT INTO migrations (id, name, applied_at) VALUES (@id, @name, @applied_at)",
      ).run({
        id: migration.id,
        name: migration.name,
        applied_at: Date.now(),
      });
    });

    apply();
  }
}

function bindShutdown(db: Database): void {
  if (g.__aiJudgeShutdownBound) return;
  g.__aiJudgeShutdownBound = true;

  const checkpoint = () => {
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      // process may already be tearing down
    }
  };

  process.once("SIGINT", () => {
    checkpoint();
  });
  process.once("SIGTERM", () => {
    checkpoint();
  });
  process.once("beforeExit", () => {
    checkpoint();
  });
}

/** Lazily created globalThis singleton (survives Next.js dev HMR). */
export function getDb(): Database {
  if (!g.__aiJudgeDb) {
    g.__aiJudgeDb = openDatabase();
    g.__aiJudgeStmtCache = new Map();
  }
  return g.__aiJudgeDb;
}

/** Memoized prepare() — statements are cached by exact SQL string. */
export function prepare(sql: string): Statement {
  const db = getDb();
  if (!g.__aiJudgeStmtCache) {
    g.__aiJudgeStmtCache = new Map();
  }
  const cached = g.__aiJudgeStmtCache.get(sql);
  if (cached) return cached;
  const stmt = db.prepare(sql);
  g.__aiJudgeStmtCache.set(sql, stmt);
  return stmt;
}

/**
 * Explicit migration runner for `npm run db:migrate` (idempotent).
 * Opening the DB applies any pending migrations; this reports final state.
 */
export function migrate(): { applied: string[] } {
  getDb();
  const rows = getDb()
    .prepare("SELECT name FROM migrations ORDER BY id ASC")
    .all() as Array<{ name: string }>;
  return { applied: rows.map((r) => r.name) };
}

/** Close the singleton (tests / scripts). Runs a WAL checkpoint first. */
export function closeDb(): void {
  if (!g.__aiJudgeDb) return;
  try {
    g.__aiJudgeDb.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // ignore
  }
  g.__aiJudgeDb.close();
  g.__aiJudgeDb = undefined;
  g.__aiJudgeStmtCache = undefined;
}

export { MIGRATIONS };
