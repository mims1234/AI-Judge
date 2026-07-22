import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeMathGroundTruth,
  runValidators,
  type TaskSnapshot,
} from "@/lib/validators/index";

const FIX = path.join(process.cwd(), "tests/fixtures/candidates/math");

const mathTask: TaskSnapshot = {
  category: "math",
  token_limit: 1200,
  task_body: "Compute free/paid after month 1",
  output_schema: {
    type: "object",
    required: [
      "free_users_after_month_1",
      "paid_users_after_month_1",
      "calculation",
      "assumptions",
    ],
    properties: {
      free_users_after_month_1: { type: "number" },
      paid_users_after_month_1: { type: "number" },
      calculation: { type: "array", items: { type: "string" }, minCount: 1 },
      assumptions: { type: "array", items: { type: "string" }, minCount: 1 },
    },
  },
};

describe("math ground truth (plans/11 §1.3)", () => {
  it("pins free=552 paid=432", () => {
    expect(computeMathGroundTruth()).toEqual({ free: 552, paid: 432 });
  });

  it("accepts exact correct fixture", () => {
    const raw = fs.readFileSync(path.join(FIX, "valid-1.txt"), "utf8");
    const findings = runValidators("math", raw, mathTask);
    expect(findings.find((f) => f.validator === "math_ground_truth")?.passed).toBe(
      true,
    );
  });

  it("accepts numeric strings 552/432", () => {
    const raw = fs.readFileSync(path.join(FIX, "valid-2.txt"), "utf8");
    const findings = runValidators("math", raw, mathTask);
    expect(findings.find((f) => f.validator === "math_ground_truth")?.passed).toBe(
      true,
    );
  });

  it("rejects classic wrong paid=436", () => {
    const raw = fs.readFileSync(
      path.join(FIX, "constraint-violation.txt"),
      "utf8",
    );
    const findings = runValidators("math", raw, mathTask);
    const paid = findings.find((f) => f.validator === "math_paid_count");
    expect(paid?.passed).toBe(false);
    expect(paid?.expected_json).toBe("432");
    expect(paid?.actual_json).toContain("436");
  });
});
