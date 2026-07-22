import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prepare } from "@/lib/db";
import { getRunEngine, resetRunEngineForTests } from "@/lib/run-engine";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("crash recovery invariants (plans/11 §2.5)", () => {
  let tdb: TestDb;
  afterEach(() => tdb?.cleanup());

  it("scored rows always have task_scores; resume skips scored work", () => {
    tdb = createTestDb();
    const bundle = prepare(
      `SELECT id FROM bundles WHERE slug = 'mini-benchmark-v1'`,
    ).get() as { id: string };
    const tasks = prepare(
      `SELECT id, category FROM tasks WHERE bundle_id = ? ORDER BY category LIMIT 2`,
    ).all(bundle.id) as Array<{ id: string; category: string }>;

    const runId = randomUUID();
    prepare(
      `INSERT INTO runs (
        id, bundle_id, bundle_hash, seed, status, parameters_json,
        budget_usd, trials, total_cost_usd, last_event_id, created_at
      ) VALUES (?, ?, 'hash', 1, 'running', ?, NULL, 1, 0.1, 0, ?)`,
    ).run(
      runId,
      bundle.id,
      JSON.stringify({ categories: tasks.map((t) => t.category) }),
      Date.now(),
    );
    prepare(`INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`).run(
      runId,
      "mock/cand-a",
    );

    // Task #1 fully committed (status + scores in the "one transaction" sense)
    const tr1 = randomUUID();
    prepare(
      `INSERT INTO task_results (
        id, run_id, task_id, candidate_model_id, trial_index, status, raw_output
      ) VALUES (?, ?, ?, 'mock/cand-a', 0, 'scored', 'done')`,
    ).run(tr1, runId, tasks[0]!.id);
    prepare(
      `INSERT INTO task_scores (
        id, task_result_id, run_id, task_id, category, candidate_model_id,
        trial_index, judgment_ids_json, judge_overalls_json, median_overall,
        disagreement, validators_passed, validators_total, created_at
      ) VALUES (?, ?, ?, ?, ?, 'mock/cand-a', 0, '[]', '[7.5]', 7.5, 1.0, 2, 2, ?)`,
    ).run(randomUUID(), tr1, runId, tasks[0]!.id, tasks[0]!.category, Date.now());

    // Task #2 pending (crash before its transaction)
    const tr2 = randomUUID();
    prepare(
      `INSERT INTO task_results (
        id, run_id, task_id, candidate_model_id, trial_index, status
      ) VALUES (?, ?, ?, 'mock/cand-a', 0, 'pending')`,
    ).run(tr2, runId, tasks[1]!.id);

    // Invariant: no scored row without task_scores
    const orphans = prepare(
      `SELECT tr.id FROM task_results tr
       LEFT JOIN task_scores ts ON ts.task_result_id = tr.id
       WHERE tr.status = 'scored' AND ts.task_result_id IS NULL`,
    ).all();
    expect(orphans).toEqual([]);

    // Simulate process restart
    resetRunEngineForTests();
    getRunEngine();

    const stillScored = prepare(
      `SELECT status FROM task_results WHERE id = ?`,
    ).get(tr1) as { status: string };
    const stillPending = prepare(
      `SELECT status FROM task_results WHERE id = ?`,
    ).get(tr2) as { status: string };
    expect(stillScored.status).toBe("scored");
    expect(stillPending.status).toBe("pending");

    // No duplicate scored rows for same (task, candidate, trial)
    const dupes = prepare(
      `SELECT task_id, candidate_model_id, trial_index, COUNT(*) AS n
       FROM task_results WHERE run_id = ? AND status = 'scored'
       GROUP BY task_id, candidate_model_id, trial_index HAVING n > 1`,
    ).all(runId);
    expect(dupes).toEqual([]);
  });
});
