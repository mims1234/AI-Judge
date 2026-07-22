import { z } from "zod";
import { isoFromMs } from "@/lib/api-helpers";
import { prepare } from "@/lib/db";
import type { Category } from "@/lib/schemas";
import { RunSnapshotSchema } from "@/lib/schemas";

/**
 * Server-side assembly of the canonical run snapshot (RunSnapshotSchema),
 * mirroring GET /api/runs/[id] — same process, no HTTP hop (plans/09 §3.1).
 * The /runs/[id] page rehydrates from this; the SSE feed deltas on top.
 */

export type RunSnapshot = z.infer<typeof RunSnapshotSchema>;

export function getRunSnapshot(id: string): RunSnapshot | null {
  const run = prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as
    | {
        id: string;
        bundle_id: string;
        bundle_hash: string;
        seed: number;
        status: string;
        parameters_json: string;
        budget_usd: number | null;
        total_cost_usd: number;
        started_at: number | null;
        finished_at: number | null;
        last_event_id: number;
      }
    | undefined;

  if (!run) return null;

  const bundle = prepare(`SELECT slug FROM bundles WHERE id = ?`).get(run.bundle_id) as
    | { slug: string }
    | undefined;

  const candidates = (
    prepare(`SELECT model_id FROM run_candidates WHERE run_id = ?`).all(id) as Array<{
      model_id: string;
    }>
  ).map((r) => r.model_id);

  const judgePool = (
    prepare(`SELECT model_id FROM run_judge_pool WHERE run_id = ?`).all(id) as Array<{
      model_id: string;
    }>
  ).map((r) => r.model_id);

  const panelRows = prepare(
    `SELECT category, panel_seed, judge_model_id, panel_position, reserve_order
     FROM category_judge_panels WHERE run_id = ?`,
  ).all(id) as Array<{
    category: Category;
    panel_seed: number;
    judge_model_id: string;
    panel_position: number | null;
    reserve_order: number | null;
  }>;

  const panelMap = new Map<
    string,
    { category: Category; panel_seed: number; judges: string[]; reserves: string[] }
  >();
  for (const row of panelRows) {
    let p = panelMap.get(row.category);
    if (!p) {
      p = { category: row.category, panel_seed: row.panel_seed, judges: [], reserves: [] };
      panelMap.set(row.category, p);
    }
    if (row.panel_position != null) {
      p.judges[row.panel_position] = row.judge_model_id;
    } else if (row.reserve_order != null) {
      p.reserves[row.reserve_order] = row.judge_model_id;
    }
  }

  const taskRows = prepare(
    `SELECT tr.*, t.category FROM task_results tr
     JOIN tasks t ON t.id = tr.task_id
     WHERE tr.run_id = ?
     ORDER BY tr.candidate_model_id, t.category, tr.trial_index`,
  ).all(id) as Array<{
    id: string;
    task_id: string;
    category: Category;
    candidate_model_id: string;
    trial_index: number;
    status: RunSnapshot["task_results"][number]["status"];
    raw_output: string | null;
    finish_reason: string | null;
    request_hash: string | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    cost_usd: number | null;
    latency_ms: number | null;
    error: string | null;
  }>;

  // Static bundle task content for the cell detail page — cheap join, deduped.
  const taskContentRows = prepare(
    `SELECT DISTINCT t.id, t.category, t.task_body, t.token_limit
     FROM tasks t JOIN task_results tr ON tr.task_id = t.id
     WHERE tr.run_id = ?
     ORDER BY t.category`,
  ).all(id) as Array<{
    id: string;
    category: Category;
    task_body: string;
    token_limit: number;
  }>;

  // Batch per-task child rows — avoids 3N round-trips on hydrate/reconnect.
  const validatorsByTr = new Map<
    string,
    Array<{
      validator: string;
      passed: boolean;
      details: string;
      expected?: string;
      actual?: string;
    }>
  >();
  const judgmentsByTr = new Map<
    string,
    RunSnapshot["task_results"][number]["judgments"]
  >();
  const scoreByTr = new Map<
    string,
    { median_overall: number; disagreement: number }
  >();

  if (taskRows.length > 0) {
    const trIds = taskRows.map((tr) => tr.id);
    const placeholders = trIds.map(() => "?").join(",");

    const validatorRows = prepare(
      `SELECT task_result_id, validator, passed, expected_json, actual_json, details
       FROM validator_results WHERE task_result_id IN (${placeholders})`,
    ).all(...trIds) as Array<{
      task_result_id: string;
      validator: string;
      passed: number;
      expected_json: string | null;
      actual_json: string | null;
      details: string;
    }>;
    for (const v of validatorRows) {
      const list = validatorsByTr.get(v.task_result_id) ?? [];
      list.push({
        validator: v.validator,
        passed: v.passed === 1,
        details: v.details,
        ...(v.expected_json ? { expected: v.expected_json } : {}),
        ...(v.actual_json ? { actual: v.actual_json } : {}),
      });
      validatorsByTr.set(v.task_result_id, list);
    }

    const judgmentRows = prepare(
      `SELECT * FROM judgment_attempts
       WHERE task_result_id IN (${placeholders}) AND is_final = 1
       ORDER BY created_at ASC`,
    ).all(...trIds) as Array<Record<string, unknown>>;
    for (const j of judgmentRows) {
      const trId = String(j.task_result_id);
      let feedback: Record<string, unknown> | null = null;
      if (typeof j.parsed_json === "string") {
        try {
          feedback = JSON.parse(j.parsed_json) as Record<string, unknown>;
        } catch {
          feedback = null;
        }
      }
      const mapped = {
        judge_model_id: String(j.judge_model_id),
        parse_status: j.parse_status as "first_try" | "repaired" | "invalid",
        is_substitute: Number(j.is_substitute) === 1,
        scores:
          j.score_correctness != null
            ? {
                correctness: Number(j.score_correctness),
                requirement_compliance: Number(j.score_compliance),
                quality: Number(j.score_quality),
                honesty: Number(j.score_honesty),
              }
            : null,
        claimed_overall:
          j.claimed_overall != null ? Number(j.claimed_overall) : null,
        computed_overall:
          j.server_overall != null ? Number(j.server_overall) : null,
        verdict: (j.verdict as "pass" | "partial_pass" | "fail" | null) ?? null,
        what_was_good: Array.isArray(feedback?.what_was_good)
          ? (feedback.what_was_good as string[])
          : [],
        what_was_terrible: Array.isArray(feedback?.what_was_terrible)
          ? (feedback.what_was_terrible as string[])
          : [],
        what_was_missing: Array.isArray(feedback?.what_was_missing)
          ? (feedback.what_was_missing as string[])
          : [],
        constraint_violations: Array.isArray(feedback?.constraint_violations)
          ? (feedback.constraint_violations as string[])
          : [],
        critical_errors: Array.isArray(feedback?.critical_errors)
          ? (feedback.critical_errors as string[])
          : [],
        specific_evidence: Array.isArray(feedback?.specific_evidence)
          ? (feedback.specific_evidence as string[])
          : [],
        one_best_improvement:
          typeof feedback?.one_best_improvement === "string"
            ? feedback.one_best_improvement
            : "",
        tokens:
          j.prompt_tokens != null
            ? {
                prompt: Number(j.prompt_tokens),
                completion: Number(j.completion_tokens ?? 0),
              }
            : null,
        cost_usd: j.cost_usd != null ? Number(j.cost_usd) : null,
        latency_ms: j.latency_ms != null ? Number(j.latency_ms) : null,
      };
      const list = judgmentsByTr.get(trId) ?? [];
      list.push(mapped);
      judgmentsByTr.set(trId, list);
    }

    const scoreRows = prepare(
      `SELECT task_result_id, median_overall, disagreement
       FROM task_scores WHERE task_result_id IN (${placeholders})`,
    ).all(...trIds) as Array<{
      task_result_id: string;
      median_overall: number;
      disagreement: number;
    }>;
    for (const s of scoreRows) {
      scoreByTr.set(s.task_result_id, {
        median_overall: s.median_overall,
        disagreement: s.disagreement,
      });
    }
  }

  const taskResults = taskRows.map((tr) => {
    const score = scoreByTr.get(tr.id);

    let error: { kind: "infra_failure" | "judging_failure"; message: string } | null =
      null;
    if (tr.error) {
      try {
        const e = JSON.parse(tr.error) as {
          kind: "infra_failure" | "judging_failure";
          message: string;
        };
        error = { kind: e.kind, message: e.message };
      } catch {
        error = { kind: "infra_failure", message: tr.error };
      }
    }

    return {
      id: tr.id,
      task_id: tr.task_id,
      category: tr.category,
      candidate_model_id: tr.candidate_model_id,
      trial_index: tr.trial_index,
      status: tr.status,
      raw_output: tr.raw_output,
      finish_reason: tr.finish_reason,
      request_hash: tr.request_hash,
      tokens:
        tr.prompt_tokens != null
          ? { prompt: tr.prompt_tokens, completion: tr.completion_tokens ?? 0 }
          : null,
      cost_usd: tr.cost_usd,
      latency_ms: tr.latency_ms,
      error,
      validator_results: validatorsByTr.get(tr.id) ?? [],
      judgments: judgmentsByTr.get(tr.id) ?? [],
      aggregate: score
        ? {
            median_overall: score.median_overall,
            disagreement: score.disagreement,
            flagged: score.disagreement > 3,
          }
        : null,
    };
  });

  let bundleRunScore: number | null = null;
  if (run.status === "completed" || run.status === "cancelled" || run.status === "incomplete") {
    const brs = prepare(
      `SELECT AVG(overall_score) AS s FROM bundle_run_scores
       WHERE run_id = ? AND overall_score IS NOT NULL`,
    ).get(id) as { s: number | null };
    bundleRunScore = brs.s;
  }

  let parameters: Record<string, unknown> = {};
  try {
    parameters = JSON.parse(run.parameters_json) as Record<string, unknown>;
  } catch {
    parameters = {};
  }

  return {
    run: {
      id: run.id,
      bundle_id: bundle?.slug ?? run.bundle_id,
      bundle_hash: run.bundle_hash,
      seed: run.seed,
      status: run.status as RunSnapshot["run"]["status"],
      parameters,
      budget_usd: run.budget_usd,
      total_cost_usd: run.total_cost_usd,
      started_at: isoFromMs(run.started_at),
      finished_at: isoFromMs(run.finished_at),
      last_event_id: run.last_event_id,
    },
    candidates,
    judge_pool: judgePool,
    panels: [...panelMap.values()],
    task_results: taskResults,
    bundle_run_score: bundleRunScore,
    tasks: taskContentRows,
  };
}
