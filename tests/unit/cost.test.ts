import { afterEach, describe, expect, it } from "vitest";
import { prepare } from "@/lib/db";
import { estimateRunCost, estimateTaskCost } from "@/lib/scoring";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("cost estimation (plans/11 §1.5)", () => {
  let tdb: TestDb;
  afterEach(() => tdb?.cleanup());

  function seedPricing() {
    tdb = createTestDb();
    const now = Date.now();
    const upsert = prepare(`
      INSERT INTO models_cache (openrouter_id, name, context_length, pricing_json, raw_json, fetched_at)
      VALUES (@id, @name, 128000, @pricing, '{}', @fetched)
      ON CONFLICT(openrouter_id) DO UPDATE SET pricing_json = excluded.pricing_json, fetched_at = excluded.fetched_at
    `);
    for (const [id, prompt, completion] of [
      ["mock/cand-a", 1, 2],
      ["mock/cand-b", 1, 2],
      ["mock/judge-1", 1, 2],
      ["mock/judge-2", 1, 2],
      ["mock/judge-3", 1, 2],
      ["mock/free", 0, 0],
    ] as const) {
      upsert.run({
        id,
        name: id,
        pricing: JSON.stringify({
          prompt_usd_per_m: prompt,
          completion_usd_per_m: completion,
        }),
        fetched: now,
      });
    }
    // missing pricing
    upsert.run({
      id: "mock/no-price",
      name: "No Price",
      pricing: JSON.stringify(null),
      fetched: now,
    });
  }

  it("estimateTaskCost returns high ≥ expected and finite numbers", () => {
    seedPricing();
    const { expected, max } = estimateTaskCost(
      {
        wrapper: "wrapper text",
        task_body: "task body text",
        judge_prompt: "judge prompt text",
        token_limit: 1000,
      },
      "mock/cand-a",
      ["mock/judge-1", "mock/judge-2", "mock/judge-3"],
    );
    expect(Number.isFinite(expected)).toBe(true);
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeGreaterThanOrEqual(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it("free models contribute 0; missing pricing does not yield NaN", () => {
    seedPricing();
    const free = estimateTaskCost(
      {
        wrapper: "w",
        task_body: "t",
        judge_prompt: "j",
        token_limit: 500,
      },
      "mock/free",
      ["mock/free"],
    );
    expect(free.expected).toBe(0);
    expect(free.max).toBe(0);

    const missing = estimateTaskCost(
      {
        wrapper: "w",
        task_body: "t",
        judge_prompt: "j",
        token_limit: 500,
      },
      "mock/no-price",
      ["mock/no-price"],
    );
    expect(Number.isNaN(missing.expected)).toBe(false);
    expect(Number.isFinite(missing.expected)).toBe(true);
  });

  it("estimateRunCost scales with candidates × categories × trials", () => {
    seedPricing();
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      category: [
        "roleplay",
        "coding",
        "math",
        "research",
        "marketing",
        "poster",
        "story",
        "judging",
      ][i]!,
      wrapper: "w",
      task_body: "body",
      judge_prompt: "judge",
      token_limit: 800,
    }));

    const categories = tasks.map((t) => t.category as import("@/lib/schemas").Category);
    const one = estimateRunCost({
      candidate_model_ids: ["mock/cand-a"],
      judge_pool_model_ids: ["mock/judge-1", "mock/judge-2", "mock/judge-3"],
      categories,
      tasks: tasks as never,
      trials_per_pair: 1,
      candidate_concurrency: 2,
    });
    const two = estimateRunCost({
      candidate_model_ids: ["mock/cand-a", "mock/cand-b"],
      judge_pool_model_ids: ["mock/judge-1", "mock/judge-2", "mock/judge-3"],
      categories,
      tasks: tasks as never,
      trials_per_pair: 1,
      candidate_concurrency: 2,
    });

    expect(two.cost_usd_expected).toBeGreaterThan(one.cost_usd_expected);
    expect(two.cost_usd_max).toBeGreaterThanOrEqual(two.cost_usd_expected);
    expect(two.cost_usd_min).toBeLessThanOrEqual(two.cost_usd_expected);
  });
});
