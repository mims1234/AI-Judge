import { describe, expect, it } from "vitest";
import { CUSTOM_ANSWER_SCHEMA } from "@/lib/bundles/custom";
import { runValidators, type TaskSnapshot } from "@/lib/validators/index";

function customTask(): TaskSnapshot {
  return {
    category: "math",
    token_limit: 1200,
    task_body: "Solve 2+2",
    output_schema: CUSTOM_ANSWER_SCHEMA as TaskSnapshot["output_schema"],
    validator_profile: "custom_answer_v1",
  };
}

describe("custom_answer_v1 validator profile", () => {
  it("skips Octant math pins", () => {
    const findings = runValidators(
      "math",
      JSON.stringify({ answer: "4" }),
      customTask(),
    );
    expect(findings.some((f) => f.validator.startsWith("math_"))).toBe(false);
    expect(
      findings.some((f) => f.validator === "custom_answer_schema" && f.passed),
    ).toBe(true);
  });

  it("rejects extra keys", () => {
    const findings = runValidators(
      "math",
      JSON.stringify({ answer: "4", extra: true }),
      customTask(),
    );
    expect(
      findings.some(
        (f) => f.validator === "no_additional_properties" && !f.passed,
      ),
    ).toBe(true);
    expect(
      findings.some((f) => f.validator === "custom_answer_schema" && !f.passed),
    ).toBe(true);
  });

  it("emits a failed custom_answer_schema when JSON is unparseable", () => {
    const findings = runValidators("math", "not json at all", customTask());
    expect(
      findings.some(
        (f) =>
          f.validator === "custom_answer_schema" &&
          !f.passed &&
          !f.informational,
      ),
    ).toBe(true);
  });

  it("official math still runs Octant extras", () => {
    const findings = runValidators(
      "math",
      JSON.stringify({
        free_users_after_month_1: 552,
        paid_users_after_month_1: 432,
        calculation: ["x"],
        assumptions: ["y"],
      }),
      {
        category: "math",
        token_limit: 1200,
        task_body: "official",
        output_schema: {
          type: "object",
          properties: {},
        } as TaskSnapshot["output_schema"],
      },
    );
    expect(findings.some((f) => f.validator.startsWith("math_"))).toBe(true);
  });
});
