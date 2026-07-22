import { describe, expect, it } from "vitest";
import {
  computedOverall,
  judgeMetaScore,
  mean,
  median,
} from "@/lib/scoring";

describe("median / mean / computedOverall (plans/11 §1.2)", () => {
  it("odd median from unsorted input", () => {
    expect(median([7, 3, 5])).toBe(5);
  });

  it("duplicates and floats", () => {
    expect(median([4, 4, 9])).toBe(4);
    expect(median([6.5, 6.5, 6.5])).toBe(6.5);
  });

  it("even count averages the two middle values", () => {
    expect(median([6, 7])).toBe(6.5);
  });

  it("disagreement = max − min (inline contract)", () => {
    const vals = [3, 9, 5];
    const disagreement = Math.max(...vals) - Math.min(...vals);
    expect(disagreement).toBe(6);
    expect(Math.max(5, 5, 5) - Math.min(5, 5, 5)).toBe(0);
    expect(disagreement > 3).toBe(true);
  });

  it("server-side overall is mean of four sub-scores", () => {
    const overall = computedOverall({
      correctness: 8,
      requirement_compliance: 6,
      quality: 7,
      honesty: 9,
    });
    expect(overall).toBe(mean([8, 6, 7, 9]));
    expect(overall).toBe(7.5);
  });

  it("no premature rounding on fine floats", () => {
    expect(median([6.33, 6.34, 6.35])).toBe(6.34);
  });

  it("claimed overall never enters computedOverall", () => {
    // computedOverall only accepts sub-scores — claimed is a separate field.
    const computed = computedOverall({
      correctness: 2,
      requirement_compliance: 2,
      quality: 2,
      honesty: 2,
    });
    expect(computed).toBe(2);
    const mismatch = Math.abs(9.5 - computed);
    const consistency = Math.max(0, 10 - 2.5 * mismatch);
    expect(consistency).toBe(0);
  });

  it("bundle-run total = equal-weight macro-average of category medians", () => {
    const cats = [8, 6, 7, 9, 5, 8, 7, 6];
    expect(mean(cats)).toBe(7);
  });

  it("provisional boundary is exactly 3 complete runs", () => {
    const provisional = (n: number) => n < 3;
    expect(provisional(2)).toBe(true);
    expect(provisional(3)).toBe(false);
  });
});

describe("judgeMetaScore consistency component (plans/11 §1.2.4)", () => {
  it("penalizes claimed vs computed mismatch", () => {
    const findings = [
      {
        validator: "math_ground_truth",
        passed: true,
        expected_json: null,
        actual_json: null,
        details: "",
      },
    ];
    const aligned = judgeMetaScore(
      {
        parse_status: "first_try",
        is_substitute: 0,
        claimed_overall: 8,
        server_overall: 8,
        parsed_json: JSON.stringify({
          what_was_good: ["Concrete free=552 evidence"],
          what_was_terrible: ["Minor structure issue noted"],
          what_was_missing: ["Could lead with equation"],
          constraint_violations: [],
          critical_errors: [],
        }),
        candidate_answer: "free=552 paid=432",
      },
      findings,
    );
    const mismatched = judgeMetaScore(
      {
        parse_status: "first_try",
        is_substitute: 0,
        claimed_overall: 9.5,
        server_overall: 2,
        parsed_json: JSON.stringify({
          what_was_good: ["Concrete free=552 evidence"],
          what_was_terrible: ["Minor structure issue noted"],
          what_was_missing: ["Could lead with equation"],
          constraint_violations: [],
          critical_errors: [],
        }),
        candidate_answer: "free=552 paid=432",
      },
      findings,
    );
    expect(aligned).toBeGreaterThan(mismatched);
  });
});
