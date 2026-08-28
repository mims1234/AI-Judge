import { describe, expect, it } from "vitest";
import {
  applyCanonicalFooter,
  computeCustomContentHash,
  CUSTOM_ANSWER_SCHEMA,
  CUSTOM_JSON_FOOTER,
  CUSTOM_JUDGE_PROMPT,
  CUSTOM_WRAPPER,
  reviewCustomPack,
} from "@/lib/bundles/custom";

const task = {
  category: "coding" as const,
  task_body: `Write a long enough coding prompt that is not the answer.\n\n${CUSTOM_JSON_FOOTER}`,
  judge_prompt: CUSTOM_JUDGE_PROMPT,
  output_schema: CUSTOM_ANSWER_SCHEMA,
  token_limit: 3000,
  weight: 1,
  must_mention: ["edge case"],
};

function hash(extra?: Partial<typeof task>) {
  return computeCustomContentHash({
    name: "Pack",
    version: "1.0.0",
    wrapper: CUSTOM_WRAPPER,
    tasks: [{ ...task, ...extra }],
  });
}

describe("canonical custom hash", () => {
  it("is stable for the same scoring content", () => {
    expect(hash()).toBe(hash());
  });

  it("changes when must_mention changes", () => {
    expect(hash({ must_mention: ["edge case"] })).not.toBe(
      hash({ must_mention: ["other"] }),
    );
  });

  it("includes the footer even if the caller omitted it", () => {
    const withFooter = computeCustomContentHash({
      name: "Pack",
      version: "1.0.0",
      wrapper: CUSTOM_WRAPPER,
      tasks: [task],
    });
    const stripped = computeCustomContentHash({
      name: "Pack",
      version: "1.0.0",
      wrapper: CUSTOM_WRAPPER,
      tasks: [
        {
          ...task,
          task_body: task.task_body.replace(CUSTOM_JSON_FOOTER, "").trim(),
        },
      ],
    });
    expect(withFooter).toBe(stripped);
  });

  it("is stable when two coding tasks are listed in either order", () => {
    const a = {
      ...task,
      task_body: `First coding idea that is long enough to hash.\n\n${CUSTOM_JSON_FOOTER}`,
    };
    const b = {
      ...task,
      task_body: `Second coding idea that is long enough to hash.\n\n${CUSTOM_JSON_FOOTER}`,
    };
    const forward = computeCustomContentHash({
      name: "Pack",
      version: "1.0.0",
      wrapper: CUSTOM_WRAPPER,
      tasks: [a, b],
    });
    const reverse = computeCustomContentHash({
      name: "Pack",
      version: "1.0.0",
      wrapper: CUSTOM_WRAPPER,
      tasks: [b, a],
    });
    expect(forward).toBe(reverse);
  });

  it("applyCanonicalFooter is idempotent", () => {
    const once = applyCanonicalFooter("Hello task body that is not empty.");
    expect(once.endsWith(CUSTOM_JSON_FOOTER)).toBe(true);
    expect(applyCanonicalFooter(once)).toBe(once);
  });
});

describe("reviewCustomPack", () => {
  it("scores 10 −2 short −1 missing mention", () => {
    const review = reviewCustomPack({
      tasks: [
        {
          category: "math",
          task_body: "too short",
          must_mention: [],
          judge_criteria: ["Gets the numeric answer"],
        },
      ],
    });
    expect(review.flags.map((f) => f.flag)).toEqual(
      expect.arrayContaining(["too_short", "missing_must_mention"]),
    );
    expect(review.score).toBe(7);
  });

  it("penalizes answer leak and footer-then-reattach is flagged", () => {
    const review = reviewCustomPack({
      tasks: [
        {
          category: "coding",
          task_body:
            "Please mention the secret phrase UNIQUEPHRASE in the body, and write at least two sentences so this prompt is not considered short.",
          must_mention: ["UNIQUEPHRASE"],
          judge_criteria: ["Mentions the required phrase"],
        },
      ],
    });
    expect(review.flags.some((f) => f.flag === "answer_leak")).toBe(true);
    expect(review.flags.some((f) => f.flag === "missing_json_footer")).toBe(true);
    expect(review.score).toBe(7);
  });
});
