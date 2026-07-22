import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER } from "@/lib/schemas";
import { MINI_V1 } from "@/lib/bundles/mini-v1";
import { runValidators, type TaskSnapshot } from "@/lib/validators/index";

function task(category: string): TaskSnapshot {
  const t = MINI_V1.tasks.find((x) => x.category === category);
  return {
    category,
    token_limit: t?.token_limit ?? 1000,
    task_body: t?.task_body ?? "task",
    output_schema: (t?.output_schema ?? {
      type: "object",
      properties: {},
    }) as TaskSnapshot["output_schema"],
  };
}

describe("validator dispatch (plans/11 §1.3)", () => {
  it("routes each of the 8 categories without throwing on valid empty-ish JSON", () => {
    for (const cat of CATEGORY_ORDER) {
      expect(() =>
        runValidators(cat, JSON.stringify({}), task(cat)),
      ).not.toThrow();
    }
  });

  it("math dispatch includes math_ground_truth finding", () => {
    const findings = runValidators(
      "math",
      JSON.stringify({
        free_users_after_month_1: 552,
        paid_users_after_month_1: 432,
        calculation: ["x"],
        assumptions: ["y"],
      }),
      task("math"),
    );
    expect(findings.some((f) => f.validator.startsWith("math_"))).toBe(true);
  });

  it.fails(
    "unknown category throws (plan contract — currently soft-falls-through; VIOLATIONS Q-B04)",
    () => {
      expect(() =>
        runValidators("not-a-category", "{}", task("math")),
      ).toThrow();
    },
  );
});
