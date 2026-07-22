import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prepare } from "@/lib/db";
import {
  finalizeRun,
  parseCategoryScoresJson,
  queryLeaderboard,
} from "@/lib/scoring";
import { CATEGORY_ORDER } from "@/lib/schemas";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("eligibility rules (penalize, don't discard)", () => {
  let tdb: TestDb;

  afterEach(() => {
    tdb?.cleanup();
  });

  function seedBundle(): string {
    tdb = createTestDb();
    const bundle = prepare(
      `SELECT id, slug FROM bundles WHERE slug = 'mini-benchmark-v1'`,
    ).get() as { id: string; slug: string };
    return bundle.id;
  }

  function insertRun(opts: {
    status: string;
    candidate: string;
    categories?: string[];
  }) {
    const bundleId = seedBundle();
    const runId = randomUUID();
    const categories = opts.categories ?? [...CATEGORY_ORDER];
    prepare(
      `INSERT INTO runs (
        id, bundle_id, bundle_hash, seed, status, parameters_json,
        budget_usd, trials, total_cost_usd, last_event_id, created_at
      ) VALUES (?, ?, 'hash', 1, ?, ?, NULL, 1, 0, 0, ?)`,
    ).run(
      runId,
      bundleId,
      opts.status,
      JSON.stringify({ categories }),
      Date.now(),
    );
    prepare(`INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`).run(
      runId,
      opts.candidate,
    );
    return { runId, bundleId };
  }

  function taskIdFor(category: string): string {
    const row = prepare(
      `SELECT t.id AS id FROM tasks t
       JOIN bundles b ON b.id = t.bundle_id
       WHERE b.slug = 'mini-benchmark-v1' AND t.category = ?`,
    ).get(category) as { id: string };
    return row.id;
  }

  function insertScoredTrial(opts: {
    runId: string;
    candidate: string;
    category: string;
    median: number;
    judgeOveralls: number[];
  }) {
    const trId = randomUUID();
    const taskId = taskIdFor(opts.category);
    prepare(
      `INSERT INTO task_results (
        id, run_id, task_id, candidate_model_id, trial_index, status
      ) VALUES (?, ?, ?, ?, 0, 'scored')`,
    ).run(trId, opts.runId, taskId, opts.candidate);
    prepare(
      `INSERT INTO task_scores (
        id, task_result_id, run_id, task_id, category, candidate_model_id,
        trial_index, judgment_ids_json, judge_overalls_json, median_overall,
        disagreement, validators_passed, validators_total, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, 0, 1, 1, ?)`,
    ).run(
      randomUUID(),
      trId,
      opts.runId,
      taskId,
      opts.category,
      opts.candidate,
      JSON.stringify(opts.judgeOveralls),
      opts.median,
      Date.now(),
    );
  }

  function insertErrorTrial(opts: {
    runId: string;
    candidate: string;
    category: string;
    kind: "infra_failure" | "judging_failure";
    trialIndex?: number;
  }) {
    const trId = randomUUID();
    const taskId = taskIdFor(opts.category);
    prepare(
      `INSERT INTO task_results (
        id, run_id, task_id, candidate_model_id, trial_index, status, error
      ) VALUES (?, ?, ?, ?, ?, 'error', ?)`,
    ).run(
      trId,
      opts.runId,
      taskId,
      opts.candidate,
      opts.trialIndex ?? 0,
      JSON.stringify({ kind: opts.kind, message: "test" }),
    );
  }

  it("cancelled runs are never leaderboard-eligible", () => {
    const { runId, bundleId } = insertRun({
      status: "cancelled",
      candidate: "mock/cand-a",
    });
    prepare(
      `INSERT INTO bundle_run_scores (
        id, run_id, bundle_id, candidate_model_id, complete,
        category_scores_json, overall_score, total_cost_usd, avg_latency_ms, created_at
      ) VALUES (?, ?, ?, ?, 1, '{}', 9.0, 0.1, 100, ?)`,
    ).run(randomUUID(), runId, bundleId, "mock/cand-a", Date.now());

    const result = finalizeRun(runId);
    expect(result.complete).toBe(false);
    expect(result.bundleRunScore).toBeNull();

    const row = prepare(
      `SELECT complete, overall_score FROM bundle_run_scores WHERE run_id = ?`,
    ).get(runId) as { complete: number; overall_score: number | null };
    expect(row.complete).toBe(0);
    expect(row.overall_score).toBeNull();
  });

  it("incomplete runs with scored work appear on the leaderboard", () => {
    const candidate = "mock/cand-b";
    const { runId } = insertRun({
      status: "incomplete",
      candidate,
      categories: ["math", "coding"],
    });
    insertScoredTrial({
      runId,
      candidate,
      category: "math",
      median: 8,
      judgeOveralls: [8, 8, 8],
    });
    insertErrorTrial({
      runId,
      candidate,
      category: "coding",
      kind: "infra_failure",
    });

    finalizeRun(runId);
    const lb = queryLeaderboard("mini-benchmark-v1");
    const row = lb.rows.find((r) => r.model_id === candidate);
    expect(row).toBeTruthy();
    // math=8, coding=0 (infra penalty) → mean 4
    expect(row!.score).toBe(4);
    expect(row!.penalized_tasks).toBe(1);
    expect(row!.coverage).toBeLessThan(1);
  });

  it("judging_failure excludes trial (does not zero the category)", () => {
    const candidate = "mock/cand-judge-fault";
    const { runId } = insertRun({
      status: "incomplete",
      candidate,
      categories: ["math"],
    });
    insertScoredTrial({
      runId,
      candidate,
      category: "math",
      median: 9,
      judgeOveralls: [9, 9, 9],
    });
    insertErrorTrial({
      runId,
      candidate,
      category: "math",
      kind: "judging_failure",
      trialIndex: 1,
    });

    finalizeRun(runId);
    const brs = prepare(
      `SELECT category_scores_json, overall_score FROM bundle_run_scores WHERE run_id = ?`,
    ).get(runId) as { category_scores_json: string; overall_score: number };
    const parsed = parseCategoryScoresJson(brs.category_scores_json);
    expect(parsed.scores.math).toBe(9);
    expect(parsed.meta.excluded_count).toBe(1);
    expect(parsed.meta.penalized_count).toBe(0);
    expect(brs.overall_score).toBe(9);
  });

  it("provisional boundary at exactly 3 scored runs", () => {
    const bundleId = seedBundle();
    const candidate = "mock/cand-prov";
    for (let i = 0; i < 3; i++) {
      const runId = randomUUID();
      prepare(
        `INSERT INTO runs (
          id, bundle_id, bundle_hash, seed, status, parameters_json,
          budget_usd, trials, total_cost_usd, last_event_id, created_at, finished_at
        ) VALUES (?, ?, 'hash', ?, 'completed', '{}', NULL, 1, 0.1, 0, ?, ?)`,
      ).run(runId, bundleId, i + 1, Date.now() + i, Date.now() + i);
      prepare(
        `INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`,
      ).run(runId, candidate);
      prepare(
        `INSERT INTO bundle_run_scores (
          id, run_id, bundle_id, candidate_model_id, complete,
          category_scores_json, overall_score, total_cost_usd, avg_latency_ms, created_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, 0.1, 100, ?)`,
      ).run(
        randomUUID(),
        runId,
        bundleId,
        candidate,
        JSON.stringify({ scores: {}, meta: { coverage: 1, penalized_count: 0, excluded_count: 0, partial_panel_count: 0 } }),
        7 + i * 0.1,
        Date.now(),
      );
    }

    // Hide the 3rd run by nulling overall_score
    prepare(
      `UPDATE bundle_run_scores SET overall_score = NULL WHERE candidate_model_id = ?`,
    ).run(candidate);
    prepare(
      `UPDATE bundle_run_scores SET overall_score = 7.0 WHERE candidate_model_id = ?
       AND rowid IN (SELECT rowid FROM bundle_run_scores WHERE candidate_model_id = ? LIMIT 2)`,
    ).run(candidate, candidate);

    const provisional = queryLeaderboard("mini-benchmark-v1").rows.find(
      (r) => r.model_id === candidate,
    );
    expect(provisional?.provisional).toBe(true);
    expect(provisional?.complete_runs).toBe(2);

    prepare(
      `UPDATE bundle_run_scores SET overall_score = 7.2 WHERE candidate_model_id = ? AND overall_score IS NULL`,
    ).run(candidate);
    const established = queryLeaderboard("mini-benchmark-v1").rows.find(
      (r) => r.model_id === candidate,
    );
    expect(established?.provisional).toBe(false);
    expect(established?.complete_runs).toBe(3);
  });

  it("judged-bad garbage can still be a real (low) complete score", () => {
    const bundleId = seedBundle();
    const runId = randomUUID();
    const candidate = "mock/cand-bad";
    prepare(
      `INSERT INTO runs (
        id, bundle_id, bundle_hash, seed, status, parameters_json,
        budget_usd, trials, total_cost_usd, last_event_id, created_at, finished_at
      ) VALUES (?, ?, 'hash', 1, 'completed', '{}', NULL, 1, 0.05, 0, ?, ?)`,
    ).run(runId, bundleId, Date.now(), Date.now());
    prepare(`INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`).run(
      runId,
      candidate,
    );
    prepare(
      `INSERT INTO bundle_run_scores (
        id, run_id, bundle_id, candidate_model_id, complete,
        category_scores_json, overall_score, total_cost_usd, avg_latency_ms, created_at
      ) VALUES (?, ?, ?, ?, 1, '{}', 1.2, 0.05, 100, ?)`,
    ).run(randomUUID(), runId, bundleId, candidate, Date.now());

    const row = queryLeaderboard("mini-benchmark-v1").rows.find(
      (r) => r.model_id === candidate,
    );
    expect(row).toBeTruthy();
    expect(row!.score).toBe(1.2);
    expect(row!.provisional).toBe(true);
  });
});
