import { describe, expect, it } from "vitest";
import { reviewCustomPack } from "@/lib/bundles/custom";
import { packReviewSummary } from "@/lib/bundles/review-flags";

describe("packReviewSummary", () => {
  it("explains two answer leaks as 10 − 3 − 3 = 4", () => {
    const review = reviewCustomPack({
      tasks: [
        {
          category: "coding",
          task_body:
            "Write a hard self-contained coding problem that includes unicode edge cases and is long enough to pass the length check.",
          must_mention: ["unicode"],
        },
        {
          category: "math",
          task_body:
            "Write a hard contest algebra problem that includes number theory and is long enough to pass the length check.",
          must_mention: ["number theory"],
        },
      ],
    });
    expect(review.score).toBe(4);
    expect(review.flags.filter((f) => f.flag === "answer_leak")).toHaveLength(2);
    expect(packReviewSummary(review)).toMatch(/Answer leak −3/);
    expect(packReviewSummary(review)).toMatch(/4\.0 \/ 10/);
  });
});
