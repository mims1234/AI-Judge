import { describe, expect, it } from "vitest";
import {
  computedOverall,
  judgeMetaScore,
  mean,
  median,
  panelConfidenceAdjusted,
  parseCategoryScoresJson,
  renderValidatorBlock,
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

describe("panelConfidenceAdjusted", () => {
  it("leaves a full 3-judge panel unchanged", () => {
    expect(panelConfidenceAdjusted(10, 3)).toBe(10);
    expect(panelConfidenceAdjusted(2, 3)).toBe(2);
  });

  it("shrinks high solo / dual scores toward 5", () => {
    expect(panelConfidenceAdjusted(10, 1)).toBeCloseTo(20 / 3, 5); // 6.666…
    expect(panelConfidenceAdjusted(10, 2)).toBeCloseTo(25 / 3, 5); // 8.333…
  });

  it("is symmetric for low scores (pulled up toward 5)", () => {
    expect(panelConfidenceAdjusted(0, 1)).toBeCloseTo(10 / 3, 5); // 3.333…
    expect(panelConfidenceAdjusted(0, 2)).toBeCloseTo(5 / 3, 5); // 1.666…
  });
});

describe("parseCategoryScoresJson (legacy + envelope)", () => {
  it("reads legacy flat maps", () => {
    const p = parseCategoryScoresJson(JSON.stringify({ math: 8, coding: 7 }));
    expect(p.scores.math).toBe(8);
    expect(p.meta.coverage).toBe(1);
  });

  it("reads the new scores/meta envelope", () => {
    const p = parseCategoryScoresJson(
      JSON.stringify({
        scores: { math: 9 },
        meta: {
          coverage: 0.5,
          penalized_count: 2,
          excluded_count: 1,
          partial_panel_count: 3,
        },
      }),
    );
    expect(p.scores.math).toBe(9);
    expect(p.meta.penalized_count).toBe(2);
    expect(p.meta.excluded_count).toBe(1);
  });
});

describe("renderValidatorBlock skipped / note semantics", () => {
  it("renders SKIPPED and NOTE marks and tells judges to ignore skipped", () => {
    const block = renderValidatorBlock([
      {
        validator: "json_parseable",
        passed: false,
        expected_json: null,
        actual_json: null,
        details: "output is not a single valid JSON document",
      },
      {
        validator: "required_keys",
        passed: false,
        expected_json: null,
        actual_json: null,
        details: "skipped: unparseable JSON",
        skipped: true,
      },
      {
        validator: "no_extra_prose",
        passed: false,
        expected_json: null,
        actual_json: null,
        details: "note: prose found outside the JSON document",
        informational: true,
      },
    ]);
    expect(block).toContain("[FAIL] json_parseable");
    expect(block).toContain("[SKIPPED — not evaluated] required_keys");
    expect(block).toContain("[NOTE] no_extra_prose");
    expect(block).toContain("IGNORE [SKIPPED]");
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
