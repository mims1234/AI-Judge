import { describe, expect, it } from "vitest";
import {
  buildBundleJudgePrompt,
  CUSTOM_JSON_FOOTER,
  extractJudgeCriteria,
  publishBlockReason,
  reviewCustomPack,
} from "@/lib/bundles/custom";
import type { PackReview } from "@/lib/bundles/pack-review";

function review(partial: Partial<PackReview> & Pick<PackReview, "score" | "flags">): PackReview {
  return { reviewed_at: 1, ...partial };
}

const healthyBody = `Write a function that reverses a Unicode string without splitting surrogate pairs. Explain the algorithm in two short paragraphs.\n\n${CUSTOM_JSON_FOOTER}`;

describe("publishBlockReason", () => {
  it("blocks answer_leak even when the score is above 6", () => {
    const quality = reviewCustomPack({
      tasks: [
        {
          category: "coding",
          task_body: healthyBody,
          must_mention: ["Unicode"],
          judge_criteria: ["Handles surrogate pairs", "Explains the algorithm"],
        },
      ],
    });
    expect(quality.score).toBeGreaterThanOrEqual(6);
    expect(publishBlockReason(quality)).toMatch(/answer leak/i);
  });

  it("blocks missing_judge_criteria even when the score is above 6", () => {
    const quality = reviewCustomPack({
      tasks: [
        {
          category: "coding",
          task_body: healthyBody,
          must_mention: ["grapheme"],
        },
      ],
    });
    expect(quality.score).toBeGreaterThanOrEqual(6);
    expect(quality.flags.some((f) => f.flag === "missing_judge_criteria")).toBe(
      true,
    );
    expect(publishBlockReason(quality)).toMatch(/judge criteria/i);
  });

  it("blocks a review score below 6 without leak or missing criteria", () => {
    const quality = reviewCustomPack({
      tasks: [
        {
          category: "coding",
          task_body: "too short",
          must_mention: [],
          judge_criteria: ["Gets a working function"],
        },
        {
          category: "math",
          task_body: "also short",
          must_mention: [],
          judge_criteria: ["Shows the arithmetic"],
        },
      ],
    });
    expect(quality.flags.some((f) => f.flag === "answer_leak")).toBe(false);
    expect(quality.flags.some((f) => f.flag === "missing_judge_criteria")).toBe(
      false,
    );
    expect(quality.score).toBeLessThan(6);
    expect(publishBlockReason(quality)).toMatch(/below 6/);
  });

  it("does not hard-block empty must-mention when the score stays at 6 or above", () => {
    const quality = reviewCustomPack({
      tasks: [
        {
          category: "coding",
          task_body: healthyBody,
          must_mention: [],
          judge_criteria: ["Handles surrogate pairs", "Explains the algorithm"],
        },
      ],
    });
    expect(quality.flags.some((f) => f.flag === "missing_must_mention")).toBe(
      true,
    );
    expect(quality.score).toBeGreaterThanOrEqual(6);
    expect(publishBlockReason(quality)).toBeNull();
  });

  it("allows a healthy task with criteria and no leak", () => {
    const quality = reviewCustomPack({
      tasks: [
        {
          category: "coding",
          task_body: healthyBody,
          must_mention: ["grapheme"],
          judge_criteria: ["Handles surrogate pairs", "Explains the algorithm"],
        },
      ],
    });
    expect(quality.score).toBe(10);
    expect(publishBlockReason(quality)).toBeNull();
  });

  it("reports a constructed score below 6", () => {
    expect(
      publishBlockReason(
        review({
          score: 5.9,
          flags: [{ category: "coding", flag: "too_short" }],
        }),
      ),
    ).toBe("Cannot publish: review score 5.9 / 10 is below 6.");
  });
});

describe("extractJudgeCriteria", () => {
  it("round-trips criteria through buildBundleJudgePrompt", () => {
    const criteria = [
      "Handles surrogate pairs without splitting",
      "Explains the reverse algorithm clearly",
    ];
    const prompt = buildBundleJudgePrompt(criteria);
    expect(extractJudgeCriteria(prompt)).toEqual(criteria);
    expect(buildBundleJudgePrompt(extractJudgeCriteria(prompt))).toBe(prompt);
  });

  it("returns an empty list when the prompt has no criteria marker", () => {
    expect(extractJudgeCriteria(buildBundleJudgePrompt([]))).toEqual([]);
  });
});
