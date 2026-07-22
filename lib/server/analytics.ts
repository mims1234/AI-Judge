import "server-only";

import type {
  CalibrationRow,
  JudgeDetail,
  JudgeRollup,
  ModelRunStats,
  SameTaskAnswer,
} from "@/lib/analytics/types";
import { prepare } from "@/lib/db";
import type { Category } from "@/lib/schemas";
import { median, queryJudgeRollups, queryLeaderboard, type LeaderboardRow } from "@/lib/scoring";
import { getBundleBySlugOrId } from "@/lib/server/bundles";

export type {
  CalibrationRow,
  JudgeDetail,
  JudgeRollup,
  ModelRunStats,
  SameTaskAnswer,
};

/**
 * Server-only analytics reads for /leaderboard, /compare, /judges and the
 * landing ranking preview. Aggregates come from backend lib/scoring.ts
 * (queryLeaderboard / queryJudgeRollups); artifact-level reads (same-task
 * answers, judge detail, calibration) are direct SQLite queries over
 * immutable score rows (plans/10 §7).
 */

/* ------------------------------ Leaderboard ------------------------------ */

export type LeaderboardData = {
  bundle_id: string;
  bundle_hash: string;
  category: Category | null;
  rows: LeaderboardRow[];
};

export function getLeaderboardData(
  bundleSlug: string,
  category?: Category,
): LeaderboardData | null {
  try {
    return queryLeaderboard(bundleSlug, category);
  } catch {
    return null;
  }
}

/* -------------------------------- Judges --------------------------------- */

export function getJudgeRollups(bundleId?: string): JudgeRollup[] {
  try {
    return queryJudgeRollups(bundleId);
  } catch {
    return [];
  }
}

export function getJudgeDetail(judgeModelId: string): JudgeDetail {
  const recent = prepare(
    `SELECT ja.server_overall AS s, ts.median_overall AS m, ja.created_at AS at
     FROM judgment_attempts ja
     JOIN task_scores ts ON ts.task_result_id = ja.task_result_id
     WHERE ja.judge_model_id = ? AND ja.is_final = 1 AND ja.server_overall IS NOT NULL
     ORDER BY ja.created_at DESC LIMIT 20`,
  ).all(judgeModelId) as Array<{ s: number; m: number; at: number }>;

  const flagged = prepare(
    `SELECT tr.id AS task_result_id, tr.run_id AS run_id, t.category AS category,
            tr.candidate_model_id AS candidate, ts.disagreement AS spread,
            ts.median_overall AS median, ja.verdict AS verdict, ja.created_at AS at
     FROM judgment_attempts ja
     JOIN task_scores ts ON ts.task_result_id = ja.task_result_id
     JOIN task_results tr ON tr.id = ja.task_result_id
     JOIN tasks t ON t.id = tr.task_id
     WHERE ja.judge_model_id = ? AND ja.is_final = 1 AND ts.disagreement > 3
     ORDER BY ja.created_at DESC LIMIT 8`,
  ).all(judgeModelId) as Array<{
    task_result_id: string;
    run_id: string;
    category: string;
    candidate: string;
    spread: number;
    median: number;
    verdict: string | null;
    at: number;
  }>;

  const parseRows = prepare(
    `SELECT parse_status AS ps, COUNT(*) AS n FROM judgment_attempts
     WHERE judge_model_id = ? GROUP BY parse_status`,
  ).all(judgeModelId) as Array<{ ps: string; n: number }>;

  return {
    recentOveralls: recent
      .map((r) => ({ overall: r.s, panelMedian: r.m }))
      .reverse(),
    flaggedJudgments: flagged.map((r) => ({
      taskResultId: r.task_result_id,
      runId: r.run_id,
      category: r.category,
      candidate: r.candidate,
      spread: r.spread,
      median: r.median,
      verdict: r.verdict,
      createdAt: new Date(r.at).toISOString(),
    })),
    parseBreakdown: {
      firstTry: parseRows.find((r) => r.ps === "first_try")?.n ?? 0,
      repaired: parseRows.find((r) => r.ps === "repaired")?.n ?? 0,
      invalid: parseRows.find((r) => r.ps === "invalid")?.n ?? 0,
    },
  };
}

/** Panel-wide σ of final overalls (context chip next to per-judge variance). */
export function getPanelWideSigma(): number | null {
  const rows = prepare(
    `SELECT server_overall AS s FROM judgment_attempts
     WHERE is_final = 1 AND server_overall IS NOT NULL`,
  ).all() as Array<{ s: number }>;
  if (rows.length < 2) return null;
  const values = rows.map((r) => r.s);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/* ------------------------------ Calibration ------------------------------ */

export function getCalibrationResults(): CalibrationRow[] {
  const rows = prepare(
    `SELECT id, fixture, judge_model_id, evidence_quality, consistency,
            correctness, parse_status, created_at
     FROM judge_calibration_results ORDER BY created_at DESC`,
  ).all() as Array<{
    id: string;
    fixture: string;
    judge_model_id: string;
    evidence_quality: number | null;
    consistency: number | null;
    correctness: number | null;
    parse_status: CalibrationRow["parse_status"];
    created_at: number;
  }>;
  return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
}

/* -------------------------------- Compare -------------------------------- */

function quartile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base]!;
  const b = sorted[base + 1];
  return b == null ? a : a + rest * (b - a);
}

export function getModelRunStats(bundleSlug: string, modelId: string): ModelRunStats {
  const bundle = getBundleBySlugOrId(bundleSlug);
  if (!bundle) {
    return { completeRuns: 0, incompleteRuns: 0, medianScore: null, q1: null, q3: null, scores: [] };
  }
  const complete = prepare(
    `SELECT brs.overall_score AS s FROM bundle_run_scores brs
     JOIN runs r ON r.id = brs.run_id
     WHERE brs.bundle_id = ? AND brs.candidate_model_id = ?
       AND brs.overall_score IS NOT NULL AND r.status != 'cancelled'
     ORDER BY r.created_at ASC`,
  ).all(bundle.id, modelId) as Array<{ s: number }>;
  const incomplete = prepare(
    `SELECT COUNT(*) AS n FROM bundle_run_scores brs
     JOIN runs r ON r.id = brs.run_id
     WHERE brs.bundle_id = ? AND brs.candidate_model_id = ?
       AND (brs.overall_score IS NULL OR brs.complete = 0)
       AND r.status != 'cancelled'`,
  ).get(bundle.id, modelId) as { n: number };

  const scores = complete.map((r) => r.s);
  const sorted = [...scores].sort((a, b) => a - b);
  return {
    completeRuns: scores.length,
    incompleteRuns: incomplete.n,
    medianScore: scores.length > 0 ? median(scores) : null,
    q1: quartile(sorted, 0.25),
    q3: quartile(sorted, 0.75),
    scores,
  };
}

/** Model ids that have ≥1 scored run in the bundle (compare picker filter). */
export function getModelsWithCompleteRuns(bundleSlug: string): string[] {
  const bundle = getBundleBySlugOrId(bundleSlug);
  if (!bundle) return [];
  const rows = prepare(
    `SELECT DISTINCT brs.candidate_model_id AS m FROM bundle_run_scores brs
     JOIN runs r ON r.id = brs.run_id
     WHERE brs.bundle_id = ? AND brs.overall_score IS NOT NULL
       AND r.status != 'cancelled'`,
  ).all(bundle.id) as Array<{ m: string }>;
  return rows.map((r) => r.m);
}

/** Each model's answer for one category, from its latest complete run (plans/10 §3.2). */
export function getSameTaskAnswers(
  bundleSlug: string,
  modelIds: string[],
  category: Category,
): SameTaskAnswer[] {
  const bundle = getBundleBySlugOrId(bundleSlug);
  if (!bundle) return [];

  return modelIds.map((modelId) => {
    const empty: SameTaskAnswer = {
      modelId,
      found: false,
      runId: null,
      runDate: null,
      answer: null,
      median: null,
      spread: null,
      flagged: false,
      validatorsPassed: 0,
      validatorsTotal: 0,
      feedback: { good: [], terrible: [], missing: [], improvements: [] },
    };

    const latestRun = prepare(
      `SELECT brs.run_id AS run_id, r.created_at AS at FROM bundle_run_scores brs
       JOIN runs r ON r.id = brs.run_id
       WHERE brs.bundle_id = ? AND brs.candidate_model_id = ?
         AND brs.overall_score IS NOT NULL AND r.status != 'cancelled'
       ORDER BY r.created_at DESC LIMIT 1`,
    ).get(bundle.id, modelId) as { run_id: string; at: number } | undefined;
    if (!latestRun) return empty;

    const trials = prepare(
      `SELECT tr.id AS id, tr.raw_output AS raw_output, tr.trial_index AS trial_index,
              ts.median_overall AS median, ts.disagreement AS spread
       FROM task_results tr
       JOIN tasks t ON t.id = tr.task_id AND t.category = ?
       LEFT JOIN task_scores ts ON ts.task_result_id = tr.id
       WHERE tr.run_id = ? AND tr.candidate_model_id = ?
       ORDER BY tr.trial_index ASC`,
    ).all(category, latestRun.run_id, modelId) as Array<{
      id: string;
      raw_output: string | null;
      trial_index: number;
      median: number | null;
      spread: number | null;
    }>;
    if (trials.length === 0) return { ...empty, runId: latestRun.run_id, runDate: new Date(latestRun.at).toISOString() };

    // Pick the trial whose median is closest to the across-trials median.
    const medians = trials.filter((t) => t.median != null).map((t) => t.median!);
    const across = medians.length > 0 ? median(medians) : null;
    const picked =
      across == null
        ? trials[0]!
        : trials.reduce((best, t) =>
            Math.abs((t.median ?? -99) - across) < Math.abs((best.median ?? -99) - across)
              ? t
              : best,
          );

    // Exclude skipped/note findings from pass-rate (fair-scoring semantics).
    const validatorRows = prepare(
      `SELECT passed, details FROM validator_results WHERE task_result_id = ?`,
    ).all(picked.id) as Array<{ passed: number; details: string }>;
    const countableValidators = validatorRows.filter((v) => {
      const d = v.details ?? "";
      return !d.startsWith("skipped:") && !d.startsWith("note:");
    });
    const validatorCounts = {
      passed: countableValidators.filter((v) => v.passed === 1).length,
      total: countableValidators.length,
    };

    const judgmentRows = prepare(
      `SELECT parsed_json FROM judgment_attempts
       WHERE task_result_id = ? AND is_final = 1 AND parsed_json IS NOT NULL`,
    ).all(picked.id) as Array<{ parsed_json: string }>;

    const feedback: SameTaskAnswer["feedback"] = {
      good: [],
      terrible: [],
      missing: [],
      improvements: [],
    };
    for (const row of judgmentRows) {
      try {
        const parsed = JSON.parse(row.parsed_json) as {
          what_was_good?: unknown;
          what_was_terrible?: unknown;
          what_was_missing?: unknown;
          one_best_improvement?: unknown;
        };
        if (Array.isArray(parsed.what_was_good)) {
          feedback.good.push(...parsed.what_was_good.filter((x): x is string => typeof x === "string"));
        }
        if (Array.isArray(parsed.what_was_terrible)) {
          feedback.terrible.push(...parsed.what_was_terrible.filter((x): x is string => typeof x === "string"));
        }
        if (Array.isArray(parsed.what_was_missing)) {
          feedback.missing.push(...parsed.what_was_missing.filter((x): x is string => typeof x === "string"));
        }
        if (typeof parsed.one_best_improvement === "string" && parsed.one_best_improvement) {
          feedback.improvements.push(parsed.one_best_improvement);
        }
      } catch {
        // skip unparseable judgment blob
      }
    }

    return {
      modelId,
      found: true,
      runId: latestRun.run_id,
      runDate: new Date(latestRun.at).toISOString(),
      answer: picked.raw_output,
      median: picked.median,
      spread: picked.spread,
      flagged: (picked.spread ?? 0) > 3,
      validatorsPassed: validatorCounts.passed,
      validatorsTotal: validatorCounts.total,
      feedback,
    };
  });
}
