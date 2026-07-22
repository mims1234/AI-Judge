import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prepare } from "@/lib/db";
import { RunSnapshotSchema } from "@/lib/schemas";
import { getRunSnapshot } from "@/lib/server/runSnapshot";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

/**
 * Snapshot tasks[] + request_hash (plans/15 §A2): the cell detail page needs
 * static bundle task content and the raw request hash alongside task results.
 */
describe("getRunSnapshot task content", () => {
  let tdb: TestDb;

  afterEach(() => {
    tdb?.cleanup();
  });

  function seedRunWithTask() {
    tdb = createTestDb();
    const bundle = prepare(
      `SELECT id FROM bundles WHERE slug = 'mini-benchmark-v1'`,
    ).get() as { id: string };
    const task = prepare(
      `SELECT id, category, task_body, token_limit FROM tasks
       WHERE bundle_id = ? AND category = 'coding'`,
    ).get(bundle.id) as {
      id: string;
      category: string;
      task_body: string;
      token_limit: number;
    };

    const runId = randomUUID();
    const candidate = "openai/test-model";
    prepare(
      `INSERT INTO runs (
        id, bundle_id, bundle_hash, seed, status, parameters_json,
        budget_usd, trials, total_cost_usd, last_event_id, created_at
      ) VALUES (?, ?, 'hash', 1, 'running', '{}', NULL, 1, 0, 0, ?)`,
    ).run(runId, bundle.id, Date.now());
    prepare(`INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`).run(
      runId,
      candidate,
    );
    const trId = randomUUID();
    prepare(
      `INSERT INTO task_results (
        id, run_id, task_id, candidate_model_id, trial_index, status,
        raw_output, request_hash, prompt_tokens, completion_tokens,
        cost_usd, latency_ms
      ) VALUES (?, ?, ?, ?, 0, 'validating', 'answer text', 'reqhash123', 11, 22, 0.001, 900)`,
    ).run(trId, runId, task.id, candidate);

    return { runId, candidate, task, trId };
  }

  it("includes static task content (id, category, task_body, token_limit)", () => {
    const { runId, task } = seedRunWithTask();
    const snapshot = getRunSnapshot(runId);
    expect(snapshot).not.toBeNull();
    const row = snapshot!.tasks.find((t) => t.id === task.id);
    expect(row).toBeDefined();
    expect(row!.category).toBe("coding");
    expect(row!.task_body).toBe(task.task_body);
    expect(row!.task_body.length).toBeGreaterThan(0);
    expect(row!.token_limit).toBe(task.token_limit);
  });

  it("dedupes tasks across candidates and trials", () => {
    const { runId } = seedRunWithTask();
    const snapshot = getRunSnapshot(runId)!;
    const ids = snapshot.tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("surfaces request_hash on task results", () => {
    const { runId, trId } = seedRunWithTask();
    const snapshot = getRunSnapshot(runId)!;
    const tr = snapshot.task_results.find((t) => t.id === trId);
    expect(tr!.request_hash).toBe("reqhash123");
    expect(tr!.raw_output).toBe("answer text");
  });

  it("batches validators, judgments, and scores into task results", () => {
    const { runId, trId, task } = seedRunWithTask();
    prepare(
      `INSERT INTO validator_results (
        id, task_result_id, validator, passed, details
      ) VALUES (?, ?, 'contains', 1, 'ok')`,
    ).run(randomUUID(), trId);
    prepare(
      `INSERT INTO judgment_attempts (
        id, task_result_id, judge_model_id, attempt, is_final, is_substitute,
        parse_status, score_correctness, score_compliance, score_quality,
        score_honesty, claimed_overall, server_overall, verdict,
        prompt_tokens, completion_tokens, cost_usd, latency_ms, created_at
      ) VALUES (?, ?, 'mock/judge-1', 1, 1, 0, 'first_try', 8, 8, 8, 8, 8, 8, 'pass',
        120, 80, 0.0042, 900, ?)`,
    ).run(randomUUID(), trId, Date.now());
    prepare(
      `INSERT INTO task_scores (
        id, task_result_id, run_id, task_id, category, candidate_model_id,
        trial_index, judgment_ids_json, judge_overalls_json, median_overall,
        disagreement, validators_passed, validators_total, created_at
      ) VALUES (?, ?, ?, ?, 'coding', 'openai/test-model', 0, '[]', '[8]', 8, 0.5, 1, 1, ?)`,
    ).run(randomUUID(), trId, runId, task.id, Date.now());

    const snapshot = getRunSnapshot(runId)!;
    const tr = snapshot.task_results.find((t) => t.id === trId)!;
    expect(tr.validator_results).toHaveLength(1);
    expect(tr.validator_results[0]!.validator).toBe("contains");
    expect(tr.judgments).toHaveLength(1);
    expect(tr.judgments[0]!.judge_model_id).toBe("mock/judge-1");
    expect(tr.judgments[0]!.tokens).toEqual({ prompt: 120, completion: 80 });
    expect(tr.judgments[0]!.cost_usd).toBe(0.0042);
    expect(tr.judgments[0]!.latency_ms).toBe(900);
    expect(tr.aggregate).toEqual({
      median_overall: 8,
      disagreement: 0.5,
      flagged: false,
    });
  });

  it("validates against RunSnapshotSchema", () => {
    const { runId } = seedRunWithTask();
    const snapshot = getRunSnapshot(runId)!;
    const parsed = RunSnapshotSchema.safeParse(snapshot);
    expect(parsed.success).toBe(true);
  });

  it("returns null for unknown runs", () => {
    tdb = createTestDb();
    expect(getRunSnapshot(randomUUID())).toBeNull();
  });
});
