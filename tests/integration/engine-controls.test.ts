import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prepare } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import {
  getRunEngine,
  resetRunEngineForTests,
  selectPanels,
} from "@/lib/run-engine";
import type { Category } from "@/lib/schemas";
import { evaluatePreflight } from "@/lib/scoring";
import { saveAppSettings } from "@/lib/server/appSettings";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";
import {
  startMockOpenRouter,
  type MockBehavior,
} from "@/tests/integration/helpers/mock-openrouter";

/**
 * Engine behaviour around the transitions a person or a restart triggers:
 * pause, resume, cancel, retry, a lost API key, and answers that name a model.
 */

const CANDIDATE = "mock/cand-a";
const JUDGES = ["mock/judge-1", "mock/judge-2", "mock/judge-3"];
/** Judge requests carry a judge model id; candidate requests never do. */
const JUDGE_CALL = '"model":"mock/judge-';
const JUDGE_OK: MockBehavior = {
  kind: "sse",
  fixtureRelPath: "sse/judge-stream-happy.sse",
};

async function waitFor(
  check: () => boolean,
  label: string,
  timeoutMs = 15_000,
): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timed out waiting for: ${label}`);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

function seedModels(): void {
  const upsert = prepare(`
    INSERT INTO models_cache (openrouter_id, name, context_length, pricing_json, raw_json, fetched_at)
    VALUES (@id, @name, 128000, @pricing, @raw, @fetched)
    ON CONFLICT(openrouter_id) DO UPDATE SET fetched_at = excluded.fetched_at
  `);
  for (const id of [CANDIDATE, ...JUDGES, "mock/judge-4"]) {
    upsert.run({
      id,
      name: id,
      pricing: JSON.stringify({ prompt_usd_per_m: 1, completion_usd_per_m: 2 }),
      raw: JSON.stringify({ supported_parameters: ["response_format"] }),
      fetched: Date.now(),
    });
  }
}

/** Insert a queued run the same way POST /api/runs does, without starting it. */
function createRun(opts: {
  categories: Category[];
  judges?: string[];
}): { runId: string; taskResultIds: string[] } {
  const judges = opts.judges ?? JUDGES;
  const input = {
    bundle_id: "mini-benchmark-v1",
    candidate_model_ids: [CANDIDATE],
    judge_pool_model_ids: judges,
    categories: opts.categories,
    trials_per_pair: 1,
    candidate_concurrency: 1,
    seed: 7,
  };
  const pre = evaluatePreflight(input);
  expect(pre.errors).toEqual([]);

  const tasks = pre.tasks.map((t) => ({
    id: t.id,
    category: t.category,
    wrapper: t.wrapper,
    task_body: t.task_body,
    judge_prompt: t.judge_prompt,
    output_schema: JSON.parse(t.output_schema) as Record<string, unknown>,
    token_limit: t.token_limit,
    must_mention: [],
    validator_profile: "official" as const,
  }));

  const runId = randomUUID();
  prepare(
    `INSERT INTO runs (
      id, bundle_id, bundle_hash, seed, status, parameters_json,
      budget_usd, trials, total_cost_usd, last_event_id, created_at
    ) VALUES (?, ?, ?, ?, 'queued', ?, NULL, 1, 0, 0, ?)`,
  ).run(
    runId,
    pre.bundle!.id,
    pre.bundle!.content_hash,
    input.seed,
    JSON.stringify({ ...input, tasks }),
    Date.now(),
  );
  prepare(`INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`).run(
    runId,
    CANDIDATE,
  );
  for (const j of judges) {
    prepare(`INSERT INTO run_judge_pool (run_id, model_id) VALUES (?, ?)`).run(
      runId,
      j,
    );
  }
  for (const row of selectPanels(input.seed, judges, opts.categories).rows) {
    prepare(
      `INSERT INTO category_judge_panels (
        run_id, category, panel_seed, judge_model_id, panel_position, reserve_order
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      runId,
      row.category,
      row.panel_seed,
      row.judge_model_id,
      row.panel_position,
      row.reserve_order,
    );
  }
  const taskResultIds: string[] = [];
  for (const task of tasks) {
    const id = randomUUID();
    taskResultIds.push(id);
    prepare(
      `INSERT INTO task_results (
        id, run_id, task_id, candidate_model_id, trial_index, status
      ) VALUES (?, ?, ?, ?, 0, 'pending')`,
    ).run(id, runId, task.id, CANDIDATE);
  }
  return { runId, taskResultIds };
}

function runStatus(runId: string): string {
  return (
    prepare(`SELECT status FROM runs WHERE id = ?`).get(runId) as {
      status: string;
    }
  ).status;
}

function taskStatus(taskResultId: string): string {
  return (
    prepare(`SELECT status FROM task_results WHERE id = ?`).get(
      taskResultId,
    ) as { status: string }
  ).status;
}

function noticeCodes(runId: string): string[] {
  return (
    prepare(
      `SELECT payload FROM run_events WHERE run_id = ? AND type = 'notice' ORDER BY id`,
    ).all(runId) as Array<{ payload: string }>
  ).map((r) => (JSON.parse(r.payload) as { code: string }).code);
}

function eventCount(runId: string, type: string): number {
  return (
    prepare(
      `SELECT COUNT(*) AS n FROM run_events WHERE run_id = ? AND type = ?`,
    ).get(runId, type) as { n: number }
  ).n;
}

describe("run engine controls", () => {
  let tdb: TestDb;
  let mock: Awaited<ReturnType<typeof startMockOpenRouter>> | null = null;
  const savedMode = process.env.AI_JUDGE_MODE;
  const savedBase = process.env.OPENROUTER_BASE_URL;

  async function setup(): Promise<NonNullable<typeof mock>> {
    tdb = createTestDb();
    seedModels();
    mock = await startMockOpenRouter();
    process.env.OPENROUTER_BASE_URL = mock.url;
    resetEnvCache();
    return mock;
  }

  afterEach(async () => {
    process.env.AI_JUDGE_MODE = savedMode;
    process.env.OPENROUTER_BASE_URL = savedBase;
    resetEnvCache();
    tdb?.cleanup();
    await mock?.close().catch(() => undefined);
    mock = null;
  });

  it("masks model names in the answer and still scores the task", async () => {
    const m = await setup();
    m.setRoutes([{ includes: JUDGE_CALL, behavior: JUDGE_OK }]);
    m.setDefaultChat({
      kind: "text",
      text: "I am mock/cand-a, also known as cand-a. The answer is 42.",
    });

    const { runId, taskResultIds } = createRun({ categories: ["math"] });
    getRunEngine().enqueue(runId, "user-key");
    await waitFor(() => runStatus(runId) === "completed", "run completed");

    expect(taskStatus(taskResultIds[0]!)).toBe("scored");
    expect(noticeCodes(runId)).toContain("MODEL_NAMES_MASKED");

    const judgeBodies = m.requests
      .filter((r) => r.body.includes(JUDGE_CALL))
      .map((r) => r.body);
    expect(judgeBodies).toHaveLength(3);
    for (const body of judgeBodies) {
      expect(body).not.toContain("cand-a");
      expect(body).toContain("[model]");
    }
  });

  it("parks a run that lost its key as paused, and resume finishes it", async () => {
    const m = await setup();
    m.setRoutes([{ includes: JUDGE_CALL, behavior: JUDGE_OK }]);
    // Production policy: no env-key fallback.
    process.env.AI_JUDGE_MODE = "prod";
    resetEnvCache();

    const { runId, taskResultIds } = createRun({ categories: ["math"] });

    // A restart: the new engine recovers the queued run, but holds no key.
    resetRunEngineForTests();
    const engine = getRunEngine();
    await waitFor(() => runStatus(runId) === "paused", "run parked as paused");

    expect(noticeCodes(runId)).toContain("NEEDS_KEY");
    expect(eventCount(runId, "run.complete")).toBe(0);
    expect(taskStatus(taskResultIds[0]!)).toBe("pending");

    engine.bindApiKey(runId, "user-key");
    engine.resume(runId);
    await waitFor(() => runStatus(runId) === "completed", "run completed");
    expect(taskStatus(taskResultIds[0]!)).toBe("scored");
  });

  it("a paused run frees the worker for the next run", async () => {
    const m = await setup();
    m.setRoutes([{ includes: JUDGE_CALL, behavior: JUDGE_OK }]);
    m.setDefaultChat({
      kind: "text",
      text: "slow answer ".repeat(24),
      chunkBytes: 96,
      delayMs: 25,
    });

    const a = createRun({ categories: ["math"] });
    const b = createRun({ categories: ["math"] });
    const engine = getRunEngine();

    engine.enqueue(a.runId, "user-key");
    await waitFor(
      () => taskStatus(a.taskResultIds[0]!) === "streaming",
      "run A streaming",
    );
    engine.pause(a.runId);
    engine.enqueue(b.runId, "user-key");

    await waitFor(() => runStatus(b.runId) === "completed", "run B completed");
    // A stopped at its checkpoint and stayed there while B ran.
    expect(runStatus(a.runId)).toBe("paused");
    expect(taskStatus(a.taskResultIds[0]!)).not.toBe("scored");
    expect(eventCount(a.runId, "run.complete")).toBe(0);

    engine.resume(a.runId);
    await waitFor(() => runStatus(a.runId) === "completed", "run A completed");
    expect(taskStatus(a.taskResultIds[0]!)).toBe("scored");
  });

  it("a task retried while the run is active is run before the run finalizes", async () => {
    const m = await setup();
    const { runId, taskResultIds } = createRun({
      categories: ["coding", "math"],
    });

    // Find text that only the first task's prompt contains.
    const rows = prepare(
      `SELECT tr.id AS id, t.task_body AS body FROM task_results tr
       JOIN tasks t ON t.id = tr.task_id WHERE tr.run_id = ?`,
    ).all(runId) as Array<{ id: string; body: string }>;
    const first = rows.find((r) => r.id === taskResultIds[0])!;
    const second = rows.find((r) => r.id === taskResultIds[1])!;
    const snippet = (first.body.match(/[A-Za-z][A-Za-z ]{22,}[A-Za-z]/g) ?? []).find(
      (s) => !second.body.includes(s),
    );
    expect(snippet).toBeTruthy();

    m.setRoutes([
      { includes: JUDGE_CALL, behavior: JUDGE_OK },
      {
        // First task: fail once, then answer on the retry.
        includes: snippet!,
        behavior: {
          kind: "sequence",
          steps: [
            { kind: "status", status: 400 },
            { kind: "text", text: "second attempt answer" },
          ],
        },
      },
    ]);
    // Second task answers slowly, so the retry lands while the run is active.
    m.setDefaultChat({
      kind: "text",
      text: "slow answer ".repeat(24),
      chunkBytes: 96,
      delayMs: 25,
    });

    const engine = getRunEngine();
    engine.enqueue(runId, "user-key");
    await waitFor(
      () =>
        taskStatus(taskResultIds[0]!) === "error" &&
        taskStatus(taskResultIds[1]!) === "streaming",
      "first task failed, second streaming",
    );

    engine.retryTask(runId, taskResultIds[0]!);
    expect(taskStatus(taskResultIds[0]!)).toBe("pending");

    await waitFor(
      () => ["completed", "incomplete"].includes(runStatus(runId)),
      "run finished",
    );
    expect(runStatus(runId)).toBe("completed");
    expect(taskStatus(taskResultIds[0]!)).toBe("scored");
    expect(taskStatus(taskResultIds[1]!)).toBe("scored");
    expect(eventCount(runId, "run.complete")).toBe(1);
  });

  it("cancelling mid-judging stores no attempts against the judges", async () => {
    const m = await setup();
    m.setRoutes([
      { includes: JUDGE_CALL, behavior: { kind: "hang", ms: 2_500 } },
    ]);
    m.setDefaultChat({ kind: "text", text: "a quick answer" });

    const { runId, taskResultIds } = createRun({
      categories: ["math"],
      judges: [...JUDGES, "mock/judge-4"],
    });
    const engine = getRunEngine();
    engine.enqueue(runId, "user-key");
    await waitFor(
      () =>
        taskStatus(taskResultIds[0]!) === "judging" &&
        m.requests.filter((r) => r.body.includes(JUDGE_CALL)).length === 3,
      "three judge calls in flight",
    );

    engine.cancel(runId);
    await waitFor(() => runStatus(runId) === "cancelled", "run cancelled");
    await new Promise((r) => setTimeout(r, 150));

    const attempts = prepare(
      `SELECT COUNT(*) AS n FROM judgment_attempts WHERE task_result_id = ?`,
    ).get(taskResultIds[0]!) as { n: number };
    expect(attempts.n).toBe(0);
    expect(noticeCodes(runId)).not.toContain("JUDGE_REPLACED");
    expect(eventCount(runId, "run.complete")).toBe(1);
    // No reserve judge was called after the cancel.
    expect(m.requests.filter((r) => r.body.includes(JUDGE_CALL))).toHaveLength(3);
  });

  it("a failed judge call is retried plainly and does not count as a repair", async () => {
    const m = await setup();
    saveAppSettings({ ...DEFAULT_APP_SETTINGS, judgeConcurrency: 1 });
    m.setRoutes([
      {
        includes: JUDGE_CALL,
        behavior: {
          kind: "sequence",
          steps: [{ kind: "status", status: 400 }, JUDGE_OK],
        },
      },
    ]);
    m.setDefaultChat({ kind: "text", text: "a quick answer" });

    const { runId, taskResultIds } = createRun({ categories: ["math"] });
    getRunEngine().enqueue(runId, "user-key");
    await waitFor(() => runStatus(runId) === "completed", "run completed");

    const judgeCalls = m.requests.filter((r) => r.body.includes(JUDGE_CALL));
    // Judge concurrency 1: the failed judge is retried before any other starts.
    const modelOf = (body: string) =>
      (JSON.parse(body) as { model: string }).model;
    expect(judgeCalls).toHaveLength(4);
    expect(modelOf(judgeCalls[1]!.body)).toBe(modelOf(judgeCalls[0]!.body));
    expect(judgeCalls[1]!.body).not.toContain("previous reply was not valid JSON");

    const attempts = prepare(
      `SELECT judge_model_id, attempt, is_final, parse_status, evidence
       FROM judgment_attempts WHERE task_result_id = ?
       ORDER BY created_at ASC, attempt ASC`,
    ).all(taskResultIds[0]!) as Array<{
      judge_model_id: string;
      attempt: number;
      is_final: number;
      parse_status: string;
      evidence: string | null;
    }>;
    const failed = attempts.filter((a) => a.parse_status === "invalid");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.is_final).toBe(0);
    expect(failed[0]!.evidence ?? "").toMatch(/^infra:/);

    const finals = attempts.filter((a) => a.is_final === 1);
    expect(finals).toHaveLength(3);
    expect(finals.every((a) => a.parse_status === "first_try")).toBe(true);
    expect(taskStatus(taskResultIds[0]!)).toBe("scored");
  });
});
