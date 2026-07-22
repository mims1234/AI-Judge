import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MINI_V1 } from "@/lib/bundles/mini-v1";
import { runValidators, type TaskSnapshot } from "@/lib/validators/index";

const FIX = path.join(process.cwd(), "tests/fixtures/candidates/coding");
const SRC = path.join(process.cwd(), "lib/validators/common.ts");

function codingTask(): TaskSnapshot {
  const t = MINI_V1.tasks.find((x) => x.category === "coding")!;
  return {
    category: "coding",
    token_limit: t.token_limit,
    task_body: t.task_body,
    output_schema: t.output_schema as TaskSnapshot["output_schema"],
  };
}

describe("coding shape validator (plans/11 §1.3)", () => {
  it("accepts valid shape with createIdempotencyGuard + ≥5 tests", () => {
    const findings = runValidators(
      "coding",
      fs.readFileSync(path.join(FIX, "valid-1.txt"), "utf8"),
      codingTask(),
    );
    expect(
      findings.find((f) => f.validator === "coding_function_present")?.passed,
    ).toBe(true);
    expect(
      findings.find((f) => f.validator === "coding_test_count")?.passed,
    ).toBe(true);
  });

  it("fails forbidden imports / short tests", () => {
    const findings = runValidators(
      "coding",
      fs.readFileSync(path.join(FIX, "constraint-violation.txt"), "utf8"),
      codingTask(),
    );
    expect(
      findings.find((f) => f.validator === "coding_no_forbidden_imports")
        ?.passed,
    ).toBe(false);
    expect(
      findings.find((f) => f.validator === "coding_test_count")?.passed,
    ).toBe(false);
  });

  it("non-execution tripwire — no eval/vm/child_process in validator source", () => {
    const src = fs.readFileSync(SRC, "utf8");
    // The forbidden-module *list* may mention names as strings; ban executable forms.
    expect(src).not.toMatch(/\beval\s*\(/);
    expect(src).not.toMatch(/new\s+Function\s*\(/);
    expect(src).not.toMatch(/node:vm/);
    expect(src).not.toMatch(/from ["']child_process["']/);
    expect(src).not.toMatch(/require\(["']child_process["']\)/);
  });
});
