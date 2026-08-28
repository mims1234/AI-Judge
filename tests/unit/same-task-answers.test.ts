import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prepare } from "@/lib/db";
import {
  getCompareTasks,
  getSameTaskAnswers,
} from "@/lib/server/analytics";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("same-task compare by task id", () => {
  let tdb: TestDb;

  afterEach(() => {
    tdb?.cleanup();
  });

  function seedDuplicateCodingPack() {
    tdb = createTestDb();
    const bundleId = randomUUID();
    const slug = "dup-coding-v1";
    prepare(
      `INSERT INTO bundles (
        id, name, version, slug, content_hash, status, changelog, created_at,
        origin
      ) VALUES (?, 'Dup Coding', '1.0.0', ?, 'hash-dup', 'published', '', ?, 'custom')`,
    ).run(bundleId, slug, Date.now());

    const taskA = randomUUID();
    const taskB = randomUUID();
    for (const [id, body] of [
      [taskA, "Reverse a string"],
      [taskB, "Merge intervals"],
    ] as const) {
      prepare(
        `INSERT INTO tasks (
          id, bundle_id, category, wrapper, task_body, judge_prompt,
          output_schema, token_limit, weight, must_mention_json
        ) VALUES (?, ?, 'coding', 'w', ?, 'judge', '{}', 1024, 1, '[]')`,
      ).run(id, bundleId, body);
    }

    const runId = randomUUID();
    const model = "mock/cand-a";
    prepare(
      `INSERT INTO runs (
        id, bundle_id, bundle_hash, seed, status, parameters_json,
        budget_usd, trials, total_cost_usd, last_event_id, created_at
      ) VALUES (?, ?, 'hash-dup', 1, 'completed', '{}', NULL, 1, 0, 0, ?)`,
    ).run(runId, bundleId, Date.now());
    prepare(`INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`).run(
      runId,
      model,
    );
    prepare(
      `INSERT INTO bundle_run_scores (
        id, run_id, bundle_id, candidate_model_id, complete,
        category_scores_json, overall_score, total_cost_usd, created_at
      ) VALUES (?, ?, ?, ?, 1, '{}', 7, 0, ?)`,
    ).run(randomUUID(), runId, bundleId, model, Date.now());

    for (const [taskId, answer, median] of [
      [taskA, "answer-reverse", 9],
      [taskB, "answer-merge", 4],
    ] as const) {
      const trId = randomUUID();
      prepare(
        `INSERT INTO task_results (
          id, run_id, task_id, candidate_model_id, trial_index, status, raw_output
        ) VALUES (?, ?, ?, ?, 0, 'scored', ?)`,
      ).run(trId, runId, taskId, model, answer);
      prepare(
        `INSERT INTO task_scores (
          id, task_result_id, run_id, task_id, category, candidate_model_id,
          trial_index, judgment_ids_json, judge_overalls_json, median_overall,
          disagreement, validators_passed, validators_total, created_at
        ) VALUES (?, ?, ?, ?, 'coding', ?, 0, '[]', '[8]', ?, 0.2, 1, 1, ?)`,
      ).run(randomUUID(), trId, runId, taskId, model, median, Date.now());
    }

    return { slug, taskA, taskB, model };
  }

  it("lists duplicate types as Coding 1 / Coding 2", () => {
    const { slug } = seedDuplicateCodingPack();
    expect(getCompareTasks(slug).map((t) => t.title)).toEqual([
      "Coding 1",
      "Coding 2",
    ]);
  });

  it("does not mix answers across two coding prompts", () => {
    const { slug, taskA, taskB, model } = seedDuplicateCodingPack();
    const a = getSameTaskAnswers(slug, [model], taskA);
    const b = getSameTaskAnswers(slug, [model], taskB);
    expect(a[0]?.answer).toBe("answer-reverse");
    expect(a[0]?.median).toBe(9);
    expect(b[0]?.answer).toBe("answer-merge");
    expect(b[0]?.median).toBe(4);
  });
});
