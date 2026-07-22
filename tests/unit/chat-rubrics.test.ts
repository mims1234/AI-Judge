import { describe, expect, it } from "vitest";
import {
  CHAT_CLASSIFY_PROMPT,
  CHAT_RUBRICS,
  chatRubricFor,
} from "@/lib/bundles/chat-rubrics";
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
    }
  });

  it("classification prompt lists all nine categories", () => {
    for (const cat of CHAT_CATEGORY_ORDER) {
      expect(CHAT_CLASSIFY_PROMPT).toContain(`${cat}:`);
    }
    expect(CHAT_CLASSIFY_PROMPT).toContain('"confidence"');
    expect(CHAT_CLASSIFY_PROMPT).toContain('"rationale"');
  });
});
