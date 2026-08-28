import {
  JudgeOutputSchema,
  type JudgeOutput,
  type ParseStatus,
} from "@/lib/schemas";
import { extractJson } from "@/lib/validators/common";

export const JUDGE_MAX_TOKENS = 4096;

export const PLATFORM_TRUNCATION_NOTE =
  "[PLATFORM NOTE: The response above was cut off by the platform output-token limit, not by the model. Do NOT penalize it for being incomplete or ending mid-sentence.]";

export type JudgeParseOk = {
  ok: true;
  parsed: JudgeOutput;
  parse_status: ParseStatus;
  evidence: null;
};

export type JudgeParseErr = {
  ok: false;
  parsed: null;
  parse_status: "invalid";
  evidence: string;
};

export type JudgeParseResult = JudgeParseOk | JudgeParseErr;

const EMPTY_LISTS: Pick<
  JudgeOutput,
  | "what_was_good"
  | "what_was_terrible"
  | "what_was_missing"
  | "constraint_violations"
  | "critical_errors"
  | "specific_evidence"
> = {
  what_was_good: [],
  what_was_terrible: [],
  what_was_missing: [],
  constraint_violations: [],
  critical_errors: [],
  specific_evidence: [],
};

function tryZod(value: unknown): JudgeOutput | null {
  const checked = JudgeOutputSchema.safeParse(value);
  return checked.success ? checked.data : null;
}

function collectJsonCandidates(raw: string): unknown[] {
  const out: unknown[] = [];
  const extracted = extractJson(raw);
  if (extracted.ok && extracted.value != null) out.push(extracted.value);

  const repaired = tryRepairTruncatedJson(raw);
  if (repaired != null) out.push(repaired);

  return out;
}

function stripTrailingCommas(text: string): string {
  return text.replace(/,\s*([\]}])/g, "$1");
}

/**
 * Close open strings / braces / brackets so a mid-cut object can JSON.parse.
 * Promptfoo-style counted close; DeepEval-style trailing-comma only after fail.
 */
export function tryRepairTruncatedJson(raw: string): unknown | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  const body = trimmed.slice(start);
  const closed = closeOpenJson(body);
  for (const candidate of [closed, stripTrailingCommas(closed)]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next
    }
  }
  return null;
}

function closeOpenJson(text: string): string {
  let inString = false;
  let escape = false;
  const stack: Array<"{" | "["> = [];
  for (const ch of text) {
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") stack.push("{");
    else if (ch === "[") stack.push("[");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let out = text;
  if (inString) out += '"';
  while (stack.length > 0) {
    const open = stack.pop();
    out += open === "[" ? "]" : "}";
  }
  return out;
}

/**
 * Prod samples die inside what_was_good[] after scores are already complete.
 * Pull the four axes + verdict and fill missing arrays.
 */
export function salvageJudgeScores(raw: string): JudgeOutput | null {
  const text = raw ?? "";
  const scoresMatch = text.match(
    /"scores"\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/,
  );
  if (!scoresMatch) return null;
  let scoresObj: unknown;
  try {
    scoresObj = JSON.parse(`{${scoresMatch[1]}}`);
  } catch {
    try {
      scoresObj = JSON.parse(`{${stripTrailingCommas(scoresMatch[1]!)}}`);
    } catch {
      return null;
    }
  }
  if (!scoresObj || typeof scoresObj !== "object") return null;
  const s = scoresObj as Record<string, unknown>;
  const overallMatch = text.match(/"overall_score"\s*:\s*(-?\d+(?:\.\d+)?)/);
  const verdictMatch = text.match(
    /"verdict"\s*:\s*"(pass|partial_pass|fail)"/,
  );
  const correctness = Number(s.correctness);
  const requirement_compliance = Number(s.requirement_compliance);
  const quality = Number(s.quality);
  const honesty = Number(s.honesty);
  if (
    ![correctness, requirement_compliance, quality, honesty].every(
      (n) => Number.isFinite(n),
    )
  ) {
    return null;
  }
  const mean =
    (correctness + requirement_compliance + quality + honesty) / 4;
  const draft = {
    scores: { correctness, requirement_compliance, quality, honesty },
    overall_score: overallMatch ? Number(overallMatch[1]) : mean,
    verdict: (verdictMatch?.[1] ?? "partial_pass") as JudgeOutput["verdict"],
    ...EMPTY_LISTS,
    one_best_improvement: "",
  };
  return tryZod(draft);
}

function pickBest(values: unknown[]): JudgeOutput | null {
  let last: JudgeOutput | null = null;
  for (const value of values) {
    const parsed = tryZod(value);
    if (parsed) last = parsed;
  }
  return last;
}

/**
 * Shared judge parse used by pack runs, chat, and calibration.
 * Ladder: extractJson → last Zod-valid object → brace-close repair →
 * scores-first salvage. Out-of-range axes still fail Zod (no clamp).
 */
export function parseJudgeOutput(
  raw: string,
  opts?: { repaired?: boolean },
): JudgeParseResult {
  const repairedFlag = opts?.repaired === true;
  const status = (ok: true): ParseStatus =>
    repairedFlag ? "repaired" : "first_try";

  const candidates = collectJsonCandidates(raw);
  const picked = pickBest(candidates);
  const salvaged = picked ? null : salvageJudgeScores(raw);
  const extracted = picked || salvaged ? null : extractJson(raw);
  const hint = extracted?.ok
    ? "JSON extracted but did not match the judge schema"
    : "Judge output was not valid JSON";
  const result: JudgeParseResult = picked
    ? { ok: true, parsed: picked, parse_status: status(true), evidence: null }
    : salvaged
      ? { ok: true, parsed: salvaged, parse_status: "repaired", evidence: null }
      : { ok: false, parsed: null, parse_status: "invalid", evidence: hint };

  return result;
}
