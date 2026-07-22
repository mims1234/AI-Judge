import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MINI_V1 } from "@/lib/bundles/mini-v1";
import {
  countWords,
  extractJson,
  runValidators,
  type TaskSnapshot,
} from "@/lib/validators/index";

const FIX = path.join(process.cwd(), "tests/fixtures/candidates");

function taskFor(category: string): TaskSnapshot {
  const t = MINI_V1.tasks.find((x) => x.category === category)!;
  return {
    category,
    token_limit: t.token_limit,
    task_body: t.task_body,
    output_schema: t.output_schema as TaskSnapshot["output_schema"],
  };
}

describe("JSON extraction / word counts (plans/11 §1.3 common)", () => {
  it("valid JSON passes parseability", () => {
    const raw = fs.readFileSync(path.join(FIX, "math/valid-1.txt"), "utf8");
    expect(extractJson(raw).ok).toBe(true);
  });

  it("fenced JSON is extractable", () => {
    const wrapped =
      "```json\n" +
      fs.readFileSync(path.join(FIX, "math/valid-1.txt"), "utf8") +
      "\n```";
    expect(extractJson(wrapped).ok).toBe(true);
    expect(extractJson(wrapped).hadFence).toBe(true);
  });

  it("prose-contaminated invalid JSON fails parseability", () => {
    const raw = fs.readFileSync(
      path.join(FIX, "math/invalid-json.txt"),
      "utf8",
    );
    const findings = runValidators("math", raw, taskFor("math"));
    expect(findings.find((f) => f.validator === "json_parseable")?.passed).toBe(
      false,
    );
  });

  it("word counting splits on Unicode whitespace (multiple spaces/newlines)", () => {
    expect(countWords("alpha   beta\n\ngamma")).toBe(3);
  });

  it("poster: under 65 words pass, 65+ fail", () => {
    const passBody = Array.from({ length: 60 }, (_, i) => `w${i}`).join(" ");
    const pass = runValidators(
      "poster",
      JSON.stringify({
        headline: "A",
        tagline: "B",
        body: passBody,
        cta: "C D",
      }),
      taskFor("poster"),
    );
    expect(pass.find((f) => f.validator === "poster_word_limit")?.passed).toBe(
      true,
    );

    const fail = runValidators(
      "poster",
      fs.readFileSync(path.join(FIX, "poster/constraint-violation.txt"), "utf8"),
      taskFor("poster"),
    );
    expect(fail.find((f) => f.validator === "poster_word_limit")?.passed).toBe(
      false,
    );
  });

  it("story: 500 and 700 pass; 499 and 701 fail", () => {
    expect(
      runValidators(
        "story",
        fs.readFileSync(path.join(FIX, "story/valid-1.txt"), "utf8"),
        taskFor("story"),
      ).find((f) => f.validator === "story_word_range")?.passed,
    ).toBe(true);
    expect(
      runValidators(
        "story",
        fs.readFileSync(path.join(FIX, "story/valid-2.txt"), "utf8"),
        taskFor("story"),
      ).find((f) => f.validator === "story_word_range")?.passed,
    ).toBe(true);
    expect(
      runValidators(
        "story",
        fs.readFileSync(
          path.join(FIX, "story/constraint-violation.txt"),
          "utf8",
        ),
        taskFor("story"),
      ).find((f) => f.validator === "story_word_range")?.passed,
    ).toBe(false);
    expect(
      runValidators(
        "story",
        fs.readFileSync(
          path.join(FIX, "story/constraint-violation-701.txt"),
          "utf8",
        ),
        taskFor("story"),
      ).find((f) => f.validator === "story_word_range")?.passed,
    ).toBe(false);
  });

  it("roleplay exact 3 questions + 5 steps; off-by-one fails", () => {
    const schema = MINI_V1.tasks.find((t) => t.category === "roleplay")!
      .output_schema as {
      properties: { diagnostic_questions: { exactCount: number } };
    };
    expect(schema.properties.diagnostic_questions.exactCount).toBe(3);

    expect(
      runValidators(
        "roleplay",
        fs.readFileSync(path.join(FIX, "roleplay/valid-1.txt"), "utf8"),
        taskFor("roleplay"),
      ).find((f) => f.validator === "roleplay_counts")?.passed,
    ).toBe(true);

    expect(
      runValidators(
        "roleplay",
        fs.readFileSync(
          path.join(FIX, "roleplay/constraint-violation.txt"),
          "utf8",
        ),
        taskFor("roleplay"),
      ).find((f) => f.validator === "roleplay_counts")?.passed,
    ).toBe(false);
  });

  it("array exact counts fail both off-by-one directions", () => {
    const short = runValidators(
      "roleplay",
      JSON.stringify({
        response: "x",
        diagnostic_questions: ["a", "b"],
        triage_steps: ["1", "2", "3", "4", "5"],
        likely_evidence_needed: "logs",
      }),
      taskFor("roleplay"),
    );
    const long = runValidators(
      "roleplay",
      JSON.stringify({
        response: "x",
        diagnostic_questions: ["a", "b", "c", "d"],
        triage_steps: ["1", "2", "3", "4", "5"],
        likely_evidence_needed: "logs",
      }),
      taskFor("roleplay"),
    );
    expect(
      short.some((f) => f.validator === "roleplay_counts" && !f.passed),
    ).toBe(true);
    expect(
      long.some((f) => f.validator === "roleplay_counts" && !f.passed),
    ).toBe(true);
  });
});
