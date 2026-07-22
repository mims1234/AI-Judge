import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prepare } from "@/lib/db";
import { getRunEngine } from "@/lib/run-engine";
import { finalizeRun } from "@/lib/scoring";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("cancellation mid-run (plans/11 §2.3)", () => {
  let tdb: TestDb;
  afterEach(() => tdb?.cleanup());

  it("cancel marks run cancelled and keeps completed scores; not leaderboard-eligible", () => {
    tdb = createTestDb();
    const bundle = prepare(
      `SELECT id FROM bundles WHERE slug = 'mini-benchmark-v1'`,
    ).get() as { id: string };
    const runId = randomUUID();
    const candidate = "mock/cand-a";

    prepare(
      `INSERT INTO runs (
        id, bundle_id, bundle_hash, seed, status, parameters_json,
        budget_usd, trials, total_cost_usd, last_event_id, created_at
      ) VALUES (?, ?, 'hash', 1, 'paused', '{}', NULL, 1, 0.2, 0, ?)`,
    ).run(runId, bundle.id, Date.now());
    prepare(`INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`).run(
      runId,
      candidate,
    );

    // Simulate one already-scored task remaining durable after cancel.
    const task = prepare(
      `SELECT id, category FROM tasks WHERE bundle_id = ? LIMIT 1`,
    ).get(bundle.id) as { id: string; category: string };
    const trId = randomUUID();
    prepare(
      `INSERT INTO task_results (
        id, run_id, task_id, candidate_model_id, trial_index, status,
        raw_output, cost_usd, latency_ms
      ) VALUES (?, ?, ?, ?, 0, 'scored', 'ok', 0.05, 100)`,
    ).run(trId, runId, task.id, candidate);
    prepare(
      `INSERT INTO task_scores (
        id, task_result_id, run_id, task_id, category, candidate_model_id,
        trial_index, judgment_ids_json, judge_overalls_json, median_overall,
        disagreement, validators_passed, validators_total, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, '[]', '[8]', 8.0, 1.0, 3, 3, ?)`,
    ).run(randomUUID(), trId, runId, task.id, task.category, candidate, Date.now());

    getRunEngine().cancel(runId);

    const status = prepare(`SELECT status FROM runs WHERE id = ?`).get(runId) as {
      status: string;
    };
    expect(status.status).toBe("cancelled");

    const scored = prepare(
      `SELECT status FROM task_results WHERE id = ?`,
    ).get(trId) as { status: string };
    expect(scored.status).toBe("scored");

    const fin = finalizeRun(runId);
    expect(fin.complete).toBe(false);
    expect(fin.bundleRunScore).toBeNull();
  });
});
