import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prepare } from "@/lib/db";
import { finalizeRun, queryLeaderboard } from "@/lib/scoring";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("eligibility rules (plans/11 §1.4)", () => {
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
    completeScore?: number | null;
    forceCompleteFlag?: 0 | 1;
  }) {
    const bundleId = seedBundle();
    const runId = randomUUID();
    prepare(
      `INSERT INTO runs (
        id, bundle_id, bundle_hash, seed, status, parameters_json,
        budget_usd, trials, total_cost_usd, last_event_id, created_at
      ) VALUES (?, ?, 'hash', 1, ?, '{}', NULL, 1, 0, 0, ?)`,
    ).run(runId, bundleId, opts.status, Date.now());
    prepare(`INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`).run(
      runId,
      opts.candidate,
    );
    return { runId, bundleId };
  }

  it("cancelled runs are never leaderboard-eligible", () => {
    const { runId, bundleId } = insertRun({
      status: "cancelled",
      candidate: "mock/cand-a",
    });
    // Seed a tempting complete-looking score row — finalizeRun must null it out.
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

  it("incomplete runs stay off the leaderboard (infra ≠ zero score)", () => {
    const { runId } = insertRun({
      status: "incomplete",
      candidate: "mock/cand-b",
    });
    finalizeRun(runId);
    const lb = queryLeaderboard("mini-benchmark-v1");
    expect(lb.rows.find((r) => r.model_id === "mock/cand-b")).toBeUndefined();
  });

  it("provisional boundary at exactly 3 complete runs", () => {
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
        ) VALUES (?, ?, ?, ?, 1, '{}', ?, 0.1, 100, ?)`,
      ).run(randomUUID(), runId, bundleId, candidate, 7 + i * 0.1, Date.now());
    }

    const after2 = () => {
      // Temporarily hide the 3rd run
      prepare(
        `UPDATE bundle_run_scores SET complete = 0 WHERE candidate_model_id = ?`,
      ).run(candidate);
      prepare(
        `UPDATE bundle_run_scores SET complete = 1 WHERE candidate_model_id = ?
         AND rowid IN (SELECT rowid FROM bundle_run_scores WHERE candidate_model_id = ? LIMIT 2)`,
      ).run(candidate, candidate);
      return queryLeaderboard("mini-benchmark-v1").rows.find(
        (r) => r.model_id === candidate,
      );
    };

    const provisional = after2();
    expect(provisional?.provisional).toBe(true);
    expect(provisional?.complete_runs).toBe(2);

    prepare(
      `UPDATE bundle_run_scores SET complete = 1 WHERE candidate_model_id = ?`,
    ).run(candidate);
    const established = queryLeaderboard("mini-benchmark-v1").rows.find(
      (r) => r.model_id === candidate,
    );
    expect(established?.provisional).toBe(false);
    expect(established?.complete_runs).toBe(3);
  });

  it("judged-bad garbage can still be a real (low) complete score", () => {
    // Distinction lock: low score ≠ incomplete.
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
