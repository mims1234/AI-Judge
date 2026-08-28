import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { isInstrumentWipeout } from "@/lib/bundles/wipeout";
import { prepare } from "@/lib/db";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("isInstrumentWipeout", () => {
  let tdb: TestDb;
  afterEach(() => tdb?.cleanup());

  function seed() {
    tdb = createTestDb();
    const bundle = prepare(
      `SELECT id FROM bundles WHERE slug = 'mini-benchmark-v1'`,
    ).get() as { id: string };
    const task = prepare(
      `SELECT id FROM tasks WHERE bundle_id = ? AND category = 'coding'`,
    ).get(bundle.id) as { id: string };
    const runId = randomUUID();
    prepare(
      `INSERT INTO runs (
        id, bundle_id, bundle_hash, seed, status, parameters_json,
        budget_usd, trials, total_cost_usd, last_event_id, created_at
      ) VALUES (?, ?, 'hash', 1, 'completed', '{}', NULL, 1, 0, 0, ?)`,
    ).run(runId, bundle.id, Date.now());
    prepare(`INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`).run(
      runId,
      "mock/cand-a",
    );
    return { runId, taskId: task.id };
  }

  function insertResult(
    runId: string,
    taskId: string,
    status: string,
    schemaPassed?: boolean,
  ) {
    const trId = randomUUID();
    prepare(
      `INSERT INTO task_results (
        id, run_id, task_id, candidate_model_id, trial_index, status
      ) VALUES (?, ?, ?, 'mock/cand-a', 0, ?)`,
    ).run(trId, runId, taskId, status);
    if (schemaPassed !== undefined) {
      prepare(
        `INSERT INTO validator_results (
          id, task_result_id, validator, passed, expected_json, actual_json, details
        ) VALUES (?, ?, 'custom_answer_schema', ?, '{}', '{}', '')`,
      ).run(randomUUID(), trId, schemaPassed ? 1 : 0);
    }
    return trId;
  }

  it("is false when nothing was attempted", () => {
    const { runId } = seed();
    expect(isInstrumentWipeout(runId)).toBe(false);
  });

  it("is false when infra failed with no schema validators", () => {
    const { runId, taskId } = seed();
    insertResult(runId, taskId, "error");
    expect(isInstrumentWipeout(runId)).toBe(false);
  });

  it("is true when every schema-checked candidate failed", () => {
    const { runId, taskId } = seed();
    insertResult(runId, taskId, "error", false);
    expect(isInstrumentWipeout(runId)).toBe(true);
  });

  it("is false when any candidate passed custom_answer_schema", () => {
    const { runId, taskId } = seed();
    insertResult(runId, taskId, "scored", true);
    expect(isInstrumentWipeout(runId)).toBe(false);
  });
});
