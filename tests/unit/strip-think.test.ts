import { describe, expect, it } from "vitest";
import { runValidators, stripThinkTags, type TaskSnapshot } from "@/lib/validators/index";

function customAnswerTask(): TaskSnapshot {
  return {
    category: "math",
    token_limit: 1200,
    task_body: "Solve 2+2",
    output_schema: {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"],
    },
    validator_profile: "custom_answer_v1",
  };
}

describe("stripThinkTags", () => {
  it("removes a closed think block and keeps the visible answer", () => {
    expect(stripThinkTags("<think>scratchpad</think>\nThe answer is 4")).toBe(
      "The answer is 4",
    );
  });

  it("drops an unclosed think block through end of string", () => {
    expect(stripThinkTags("prefix <think>never finished")).toBe("prefix");
  });

  it("removes multiple closed pairs", () => {
    expect(
      stripThinkTags("<think>one</think>visible<think>two</think> more"),
    ).toBe("visible more");
  });

  it("is case-insensitive and allows attributes on the open tag", () => {
    expect(
      stripThinkTags(`<THINK extra="1">notes</Think>\n{"ok":true}`),
    ).toBe(`{"ok":true}`);
  });

  it("leaves JSON after a think block", () => {
    expect(
      stripThinkTags(`<think>plan</think>\n{"answer":"4"}`),
    ).toBe(`{"answer":"4"}`);
  });

  it("does not strip the word think in prose", () => {
    expect(stripThinkTags("I think the proof is sound.")).toBe(
      "I think the proof is sound.",
    );
  });

  it("returns empty string unchanged", () => {
    expect(stripThinkTags("")).toBe("");
  });

  it("removes stray closing tags", () => {
    expect(stripThinkTags("visible answer</think>")).toBe("visible answer");
  });
});

describe("runValidators + think blocks", () => {
  it("parses custom_answer_v1 JSON preceded by a think block", () => {
    const findings = runValidators(
      "math",
      `<think>2 + 2 is 4</think>\n${JSON.stringify({ answer: "4" })}`,
      customAnswerTask(),
    );
    expect(
      findings.some((f) => f.validator === "custom_answer_schema" && f.passed),
    ).toBe(true);
  });
});
