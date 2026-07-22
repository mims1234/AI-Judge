import { describe, expect, it } from "vitest";
import {
  CHAT_CLASSIFY_PROMPT,
  CHAT_RUBRICS,
  chatRubricFor,
} from "@/lib/bundles/chat-rubrics";
import {
  JUDGE_ENGLISH_ONLY_RULE,
  withJudgeEnglishOnly,
} from "@/lib/bundles/judge-language";
import { JUDGE_PROMPT } from "@/lib/bundles/mini-v1";
import { CHAT_CATEGORY_ORDER } from "@/lib/schemas";

describe("chat rubrics (plans/16 §B2)", () => {
  it("exposes a rubric for every chat category", () => {
    for (const cat of CHAT_CATEGORY_ORDER) {
      expect(CHAT_RUBRICS[cat]).toBeTypeOf("string");
      expect(chatRubricFor(cat)).toBe(CHAT_RUBRICS[cat]);
      expect(chatRubricFor(cat)).toContain(cat.toUpperCase());
      expect(chatRubricFor(cat)).toContain("Judge the assistant's replies only");
      expect(chatRubricFor(cat)).toContain('"scores"');
      expect(chatRubricFor(cat)).toContain('"verdict"');
      expect(chatRubricFor(cat)).toContain("Respond in English only");
    }
  });

  it("classification prompt lists all nine categories", () => {
    for (const cat of CHAT_CATEGORY_ORDER) {
      expect(CHAT_CLASSIFY_PROMPT).toContain(`${cat}:`);
    }
    expect(CHAT_CLASSIFY_PROMPT).toContain('"confidence"');
    expect(CHAT_CLASSIFY_PROMPT).toContain('"rationale"');
    expect(CHAT_CLASSIFY_PROMPT).toContain("Respond in English only");
  });

  it("benchmark JUDGE_PROMPT requires English-only free text", () => {
    expect(JUDGE_PROMPT).toContain("Respond in English only");
  });

  it("withJudgeEnglishOnly is idempotent", () => {
    const once = withJudgeEnglishOnly("You are a judge.");
    expect(once).toContain(JUDGE_ENGLISH_ONLY_RULE);
    expect(withJudgeEnglishOnly(once)).toBe(once);
  });
});
