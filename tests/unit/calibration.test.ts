import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { judgeMetaScore, type CalibrationFixture } from "@/lib/scoring";

const CASES = path.join(
  process.cwd(),
  "tests/fixtures/calibration/cases",
);

function loadCases(): CalibrationFixture[] {
  return fs
    .readdirSync(CASES)
    .filter((f) => f.endsWith(".json"))
    .map(
      (f) =>
        JSON.parse(
          fs.readFileSync(path.join(CASES, f), "utf8"),
        ) as CalibrationFixture,
    );
}

describe("calibration meta-rating (plans/11 §1 / §4)", () => {
  it("fixture tree has human-reviewed cases + provenance README", () => {
    expect(fs.existsSync(path.join(CASES, "..", "README.md"))).toBe(true);
    expect(loadCases().length).toBeGreaterThanOrEqual(8);
  });

  it("evidence-rich first-try judgment scores higher than empty fluff", () => {
    const findings = [
      {
        validator: "math_ground_truth",
        passed: false,
        expected_json: '{"free":552,"paid":432}',
        actual_json: '{"free":552,"paid":436}',
        details: "paid mismatch",
      },
    ];

    const rich = judgeMetaScore(
      {
        parse_status: "first_try",
        claimed_overall: 3,
        server_overall: 3,
        parsed_json: JSON.stringify({
          what_was_good: ["States free users 552 correctly"],
          what_was_terrible: ["Paid 436 ignores convert non-churn rule"],
          what_was_missing: ["Should recompute from original 400 paid base"],
          constraint_violations: ["math_ground_truth paid"],
          critical_errors: [],
        }),
        candidate_answer:
          '{"free_users_after_month_1":552,"paid_users_after_month_1":436}',
      },
      findings,
    );

    const fluff = judgeMetaScore(
      {
        parse_status: "first_try",
        claimed_overall: 8,
        server_overall: 8,
        parsed_json: JSON.stringify({
          what_was_good: ["ok"],
          what_was_terrible: [],
          what_was_missing: [],
          constraint_violations: [],
          critical_errors: [],
        }),
        candidate_answer: "whatever",
      },
      findings,
    );

    expect(rich).toBeGreaterThan(fluff);
  });

  it("parse status tiers: first_try > repaired > invalid", () => {
    const base = {
      claimed_overall: 7,
      server_overall: 7,
      parsed_json: JSON.stringify({
        what_was_good: ["Concrete detail about the answer body here"],
        what_was_terrible: ["One concrete flaw called out clearly"],
        what_was_missing: ["One concrete missing piece noted"],
        constraint_violations: [],
        critical_errors: [],
      }),
      candidate_answer: "Concrete detail about the answer body here",
    };
    const findings = [
      {
        validator: "json_parseable",
        passed: true,
        expected_json: null,
        actual_json: null,
        details: "",
      },
    ];
    const first = judgeMetaScore({ ...base, parse_status: "first_try" }, findings);
    const repaired = judgeMetaScore(
      { ...base, parse_status: "repaired" },
      findings,
    );
    const invalid = judgeMetaScore(
      { ...base, parse_status: "invalid" },
      findings,
    );
    expect(first).toBeGreaterThan(repaired);
    expect(repaired).toBeGreaterThan(invalid);
  });
});
