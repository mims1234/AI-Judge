import { describe, expect, it } from "vitest";
import {
  parseJudgeOutput,
  salvageJudgeScores,
  tryRepairTruncatedJson,
} from "@/lib/judge-parse";

const COMPLETE = {
  scores: {
    correctness: 9,
    requirement_compliance: 8,
    quality: 8,
    honesty: 9,
  },
  overall_score: 8.5,
  verdict: "pass" as const,
  what_was_good: ["Clear structure"],
  what_was_terrible: [],
  what_was_missing: [],
  constraint_violations: [],
  critical_errors: [],
  specific_evidence: ["quoted the function name"],
  one_best_improvement: "Add an edge-case test",
};

describe("parseJudgeOutput", () => {
  it("parses clean JSON as first_try", () => {
    const r = parseJudgeOutput(JSON.stringify(COMPLETE));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parse_status).toBe("first_try");
      expect(r.parsed.verdict).toBe("pass");
      expect(r.parsed.scores.correctness).toBe(9);
    }
  });

  it("extracts fenced / prose-wrapped JSON", () => {
    const raw = `Here is my judgment:\n\`\`\`json\n${JSON.stringify(COMPLETE)}\n\`\`\`\nThanks.`;
    const r = parseJudgeOutput(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parsed.verdict).toBe("pass");
  });

  it("salvages unterminated what_was_good after complete scores (prod sample)", () => {
    const raw =
      '{"scores":{"correctness":9.5,"requirement_compliance":9,"quality":8,"honesty":9},"overall_score":9.7,"verdict":"pass","what_was_good":["Correct factor';
    const r = parseJudgeOutput(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parse_status).toBe("repaired");
      expect(r.parsed.scores.correctness).toBe(9.5);
      expect(r.parsed.verdict).toBe("pass");
      expect(r.parsed.what_was_good).toEqual([]);
    }
  });

  it("rejects out-of-range axes (no silent clamp)", () => {
    const raw = JSON.stringify({
      ...COMPLETE,
      scores: { ...COMPLETE.scores, honesty: 11 },
    });
    const r = parseJudgeOutput(raw);
    expect(r.ok).toBe(false);
  });

  it("returns invalid for empty / aborted text", () => {
    expect(parseJudgeOutput("").ok).toBe(false);
    expect(parseJudgeOutput("aborted").ok).toBe(false);
  });
});

describe("salvage and brace repair", () => {
  it("salvageJudgeScores reads four axes from a cut object", () => {
    const raw =
      '{"scores":{"correctness":7,"requirement_compliance":6,"quality":5,"honesty":8},"overall_score":6.5,"verdict":"partial_pass","what_was_good":["';
    const s = salvageJudgeScores(raw);
    expect(s?.scores.honesty).toBe(8);
    expect(s?.verdict).toBe("partial_pass");
  });

  it("tryRepairTruncatedJson closes open braces", () => {
    const raw = '{"scores":{"correctness":1,"requirement_compliance":2,"quality":3,"honesty":4}';
    const v = tryRepairTruncatedJson(raw) as {
      scores: { honesty: number };
    };
    expect(v.scores.honesty).toBe(4);
  });
});
