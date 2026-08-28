import { describe, expect, it } from "vitest";
import {
  applyReasoningToBody,
  initialReasoningStyle,
  reservedReasoningTokens,
  stepDownReasoning,
} from "@/lib/openrouter";

describe("OpenRouter reasoning budget (shared max_tokens cap)", () => {
  it("reserves thinking so wire max_tokens is strictly larger", () => {
    const think = reservedReasoningTokens(1024);
    expect(think).toBe(1024);
    const body: Record<string, unknown> = {};
    applyReasoningToBody(body, 1024, "exclude_budget");
    expect(body.max_tokens).toBe(1024 + think);
    expect(body.reasoning).toEqual({ exclude: true, max_tokens: think });
    expect(Number(body.max_tokens)).toBeGreaterThan(
      (body.reasoning as { max_tokens: number }).max_tokens,
    );
  });

  it("never sends effort together with reasoning.max_tokens", () => {
    const off: Record<string, unknown> = {};
    applyReasoningToBody(off, 512, "off");
    expect(off.reasoning).toEqual({ effort: "none" });
    expect(off.max_tokens).toBe(512);

    const hide: Record<string, unknown> = {};
    applyReasoningToBody(hide, 512, "exclude");
    expect(hide.reasoning).toEqual({ exclude: true });
    expect(
      (hide.reasoning as { max_tokens?: number }).max_tokens,
    ).toBeUndefined();
  });

  it("steps exclude_budget → exclude → omit; off → omit", () => {
    expect(initialReasoningStyle({ excludeReasoning: true })).toBe(
      "exclude_budget",
    );
    expect(initialReasoningStyle({ disableReasoning: true })).toBe("off");
    expect(stepDownReasoning("exclude_budget")).toBe("exclude");
    expect(stepDownReasoning("exclude")).toBe("omit");
    expect(stepDownReasoning("off")).toBe("omit");
    expect(stepDownReasoning("omit")).toBe("omit");
  });
});
