import type { ValidatorFinding } from "@/lib/validators/common";

function skippedMath(
  validator: string,
  expected_json: string,
): ValidatorFinding {
  return {
    validator,
    passed: false,
    expected_json,
    actual_json: null,
    details: "skipped: unparseable JSON",
    skipped: true,
  };
}

/**
 * Pinned math ground truth — the ONLY correct answers.
 * free = 552, paid = 432. Derived nowhere else.
 */
export function computeMathGroundTruth(): { free: number; paid: number } {
  const startFree = 600;
  const startPaid = 400;
  const converts = startFree * 0.08; // 48
  const churned = startPaid * 0.04; // 16 — from original 400 only
  return {
    free: startFree - converts, // 552
    paid: startPaid - churned + converts, // 432
  };
}

function parseNumericField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function validateMathGroundTruth(
  parsed: Record<string, unknown> | null,
): ValidatorFinding[] {
  const truth = computeMathGroundTruth();
  const findings: ValidatorFinding[] = [];

  if (!parsed) {
    return [
      skippedMath("math_free_count", JSON.stringify(truth.free)),
      skippedMath("math_paid_count", JSON.stringify(truth.paid)),
      skippedMath("math_ground_truth", JSON.stringify(truth)),
    ];
  }

  const freeRaw = parsed.free_users_after_month_1;
  const paidRaw = parsed.paid_users_after_month_1;
  const freeNum = parseNumericField(freeRaw);
  const paidNum = parseNumericField(paidRaw);

  const freePass = freeNum === truth.free;
  const paidPass = paidNum === truth.paid;

  findings.push({
    validator: "math_free_count",
    passed: freePass,
    expected_json: JSON.stringify(truth.free),
    actual_json: freeRaw === undefined ? null : JSON.stringify(freeRaw),
    details: freePass
      ? `free=${truth.free} matches`
      : `expected free=${truth.free}, got ${freeRaw === undefined ? "missing" : String(freeRaw)}`,
  });

  findings.push({
    validator: "math_paid_count",
    passed: paidPass,
    expected_json: JSON.stringify(truth.paid),
    actual_json: paidRaw === undefined ? null : JSON.stringify(paidRaw),
    details: paidPass
      ? `paid=${truth.paid} matches`
      : `expected paid=${truth.paid}, got ${paidRaw === undefined ? "missing" : String(paidRaw)}`,
  });

  findings.push({
    validator: "math_ground_truth",
    passed: freePass && paidPass,
    expected_json: JSON.stringify(truth),
    actual_json: JSON.stringify({
      free: freeRaw ?? null,
      paid: paidRaw ?? null,
    }),
    details:
      freePass && paidPass
        ? `free=${truth.free} paid=${truth.paid} both match`
        : `expected free=${truth.free} paid=${truth.paid}`,
  });

  return findings;
}
