import { describe, expect, it } from "vitest";
import {
  CategorySchema,
  CATEGORY_ORDER,
  GenerateCustomBundleSchema,
  OFFICIAL_CATEGORY_ORDER,
  presentCategories,
} from "@/lib/schemas";

describe("pack categories", () => {
  it("parses official types plus general and other", () => {
    expect(CategorySchema.parse("coding")).toBe("coding");
    expect(CategorySchema.parse("general")).toBe("general");
    expect(CategorySchema.parse("other")).toBe("other");
    expect(CategorySchema.safeParse("unknown").success).toBe(false);
  });

  it("keeps official Octant/Keel on eight types", () => {
    expect([...OFFICIAL_CATEGORY_ORDER]).toEqual([
      "roleplay",
      "coding",
      "math",
      "research",
      "marketing",
      "poster",
      "story",
      "judging",
    ]);
    expect(CATEGORY_ORDER).toEqual([
      ...OFFICIAL_CATEGORY_ORDER,
      "general",
      "other",
    ]);
  });

  it("presentCategories keeps canonical order and falls back to official eight", () => {
    expect(presentCategories(["other", "coding", "general"])).toEqual([
      "coding",
      "general",
      "other",
    ]);
    expect(presentCategories([])).toEqual([...OFFICIAL_CATEGORY_ORDER]);
  });

  it("accepts general and other pack slots", () => {
    const parsed = GenerateCustomBundleSchema.parse({
      slots: [
        { category: "general", prompt: "Explain this idea in plain language." },
        { category: "other", prompt: "Do this unusual check that has no home." },
      ],
      generator_model_id: "openai/gpt-4.1-mini",
    });
    expect(parsed.slots.map((s) => s.category)).toEqual(["general", "other"]);
  });
});
