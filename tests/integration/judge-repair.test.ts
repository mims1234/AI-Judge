import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractJson } from "@/lib/validators/index";

/**
 * Judge parse-outcome fixtures (plans/11 §2.2 unit-adjacent).
 * Full engine reserve-replacement is covered when mock routing is wired to a
 * live enqueue; here we pin the fixture contracts the engine consumes.
 */
describe("judge repair fixtures (plans/11 §2.2)", () => {
  const FIX = path.join(process.cwd(), "tests/fixtures/judges");

  it("valid-first-try is clean JSON", () => {
    const raw = fs.readFileSync(path.join(FIX, "valid-first-try.json"), "utf8");
    const parsed = extractJson(raw);
    expect(parsed.ok).toBe(true);
    expect(parsed.hasExtraProse).toBe(false);
  });

  it("prose-wrapped fixture is extractable (repairable path)", () => {
    const raw = fs.readFileSync(
      path.join(FIX, "prose-wrapped-repairable.txt"),
      "utf8",
    );
    const parsed = extractJson(raw);
    // Fenced JSON should extract; marks the repairable fixture class.
    expect(parsed.ok).toBe(true);
  });

  it("invalid-both-attempts is not JSON", () => {
    const raw = fs.readFileSync(
      path.join(FIX, "invalid-both-attempts.txt"),
      "utf8",
    );
    expect(extractJson(raw).ok).toBe(false);
  });

  it("inconsistent-overall has large claim mismatch", () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(FIX, "inconsistent-overall.json"), "utf8"),
    ) as {
      scores: Record<string, number>;
      overall_score: number;
    };
    const computed =
      (raw.scores.correctness +
        raw.scores.requirement_compliance +
        raw.scores.quality +
        raw.scores.honesty) /
      4;
    expect(Math.abs(raw.overall_score - computed)).toBeGreaterThan(3);
  });

  it("schema-drift fails verdict enum / required fields at fixture level", () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(FIX, "schema-drift.json"), "utf8"),
    ) as { verdict: string; scores: Record<string, number> };
    expect(["pass", "partial_pass", "fail"]).not.toContain(raw.verdict);
    expect(raw.scores.honesty).toBeUndefined();
  });
});
