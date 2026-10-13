import { describe, expect, it } from "vitest";
import {
  MODEL_NAME_MASK,
  findModelMention,
  maskModelMentions,
  modelNameNeedles,
} from "@/lib/blind";

describe("blind-judging helpers", () => {
  it("builds needles from the full id, the suffix, and the suffix without a variant", () => {
    expect(modelNameNeedles(["openai/gpt-4o:free"])).toEqual([
      "openai/gpt-4o:free",
      "gpt-4o:free",
      "gpt-4o",
    ]);
    expect(modelNameNeedles(["  ", "localmodel"])).toEqual(["localmodel"]);
  });

  it("does not match a short id inside a longer word or number", () => {
    const ids = ["openai/o3"];
    expect(findModelMention("Use foo3 and the video30 codec.", ids)).toBeNull();
    expect(findModelMention("CO3 is carbonate.", ids)).toBeNull();
    expect(findModelMention("I am o3, built by OpenAI.", ids)).toBe("o3");
    expect(findModelMention("Compared with o3-mini it is slower.", ids)).toBe("o3");
  });

  it("matches case-insensitively and reports the text as written", () => {
    expect(findModelMention("As GPT-4o I would say", ["openai/gpt-4o"])).toBe(
      "GPT-4o",
    );
  });

  it("masks every mention and counts them", () => {
    const out = maskModelMentions(
      "I am openai/gpt-4o. gpt-4o is my name; GPT-4O too. Not gpt-4oo.",
      ["openai/gpt-4o", "anthropic/claude-x"],
    );
    expect(out.masked).toBe(3);
    expect(out.text).toBe(
      `I am ${MODEL_NAME_MASK}. ${MODEL_NAME_MASK} is my name; ${MODEL_NAME_MASK} too. Not gpt-4oo.`,
    );
    expect(findModelMention(out.text, ["openai/gpt-4o"])).toBeNull();
  });

  it("leaves text alone when there is nothing to mask or no ids", () => {
    expect(maskModelMentions("plain answer", ["openai/gpt-4o"])).toEqual({
      text: "plain answer",
      masked: 0,
    });
    expect(maskModelMentions("openai/gpt-4o", [])).toEqual({
      text: "openai/gpt-4o",
      masked: 0,
    });
  });

  it("treats regex characters in ids literally", () => {
    expect(findModelMention("try x.y+z now", ["vendor/x.y+z"])).toBe("x.y+z");
    expect(findModelMention("try xay+z now", ["vendor/x.y+z"])).toBeNull();
  });
});
