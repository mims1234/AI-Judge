import { apiError, isoFromMs } from "@/lib/api-helpers";
import { prepare } from "@/lib/db";
import type { Category } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const run = prepare(
      `SELECT * FROM runs WHERE id = ?`,
    ).get(id) as
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

    if (!run) {
      return apiError("RUN_NOT_FOUND", 404, `No run with id ${id}`);
    }

    const bundle = prepare(`SELECT slug FROM bundles WHERE id = ?`).get(
      run.bundle_id,
    ) as { slug: string } | undefined;

    const candidates = (
      prepare(`SELECT model_id FROM run_candidates WHERE run_id = ?`).all(
        id,
      ) as Array<{ model_id: string }>
    ).map((r) => r.model_id);

    const judge_pool = (
      prepare(`SELECT model_id FROM run_judge_pool WHERE run_id = ?`).all(
        id,
      ) as Array<{ model_id: string }>
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
      {
        category: Category;
        panel_seed: number;
        judges: string[];
        reserves: string[];
      }
    >();
    for (const row of panelRows) {
      let p = panelMap.get(row.category);
      if (!p) {
        p = {
          category: row.category,
          panel_seed: row.panel_seed,
          judges: [],
          reserves: [],
        };
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
      status: string;
      raw_output: string | null;
      finish_reason: string | null;
      prompt_tokens: number | null;
      completion_tokens: number | null;
      cost_usd: number | null;
      latency_ms: number | null;
      error: string | null;
    }>;

    const task_results = taskRows.map((tr) => {
      const validator_results = (
        prepare(
          `SELECT validator, passed, expected_json, actual_json, details
           FROM validator_results WHERE task_result_id = ?`,
        ).all(tr.id) as Array<{
          validator: string;
          passed: number;
          expected_json: string | null;
          actual_json: string | null;
          details: string;
        }>
      ).map((v) => ({
        validator: v.validator,
        passed: v.passed === 1,
        details: v.details,
        ...(v.expected_json ? { expected: v.expected_json } : {}),
        ...(v.actual_json ? { actual: v.actual_json } : {}),
      }));

      const judgments = (
        prepare(
          `SELECT * FROM judgment_attempts
           WHERE task_result_id = ? AND is_final = 1
           ORDER BY created_at ASC`,
        ).all(tr.id) as Array<Record<string, unknown>>
      ).map((j) => {
        let feedback: Record<string, unknown> | null = null;
        if (typeof j.parsed_json === "string") {
          try {
            feedback = JSON.parse(j.parsed_json) as Record<string, unknown>;
          } catch {
            feedback = null;
          }
        }
        return {
          judge_model_id: String(j.judge_model_id),
          parse_status: j.parse_status as
            | "first_try"
            | "repaired"
            | "invalid",
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
          verdict: (j.verdict as string | null) ?? null,
          what_was_good: Array.isArray(feedback?.what_was_good)
            ? (feedback!.what_was_good as string[])
            : [],
          what_was_terrible: Array.isArray(feedback?.what_was_terrible)
            ? (feedback!.what_was_terrible as string[])
            : [],
          what_was_missing: Array.isArray(feedback?.what_was_missing)
            ? (feedback!.what_was_missing as string[])
            : [],
          constraint_violations: Array.isArray(feedback?.constraint_violations)
            ? (feedback!.constraint_violations as string[])
            : [],
          critical_errors: Array.isArray(feedback?.critical_errors)
            ? (feedback!.critical_errors as string[])
            : [],
          specific_evidence: Array.isArray(feedback?.specific_evidence)
            ? (feedback!.specific_evidence as string[])
            : [],
          one_best_improvement:
            typeof feedback?.one_best_improvement === "string"
              ? feedback.one_best_improvement
              : "",
        };
      });

      const score = prepare(
        `SELECT median_overall, disagreement FROM task_scores WHERE task_result_id = ?`,
      ).get(tr.id) as
        | { median_overall: number; disagreement: number }
        | undefined;

      let error: {
        kind: "infra_failure" | "judging_failure";
        message: string;
      } | null = null;
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
        tokens:
          tr.prompt_tokens != null
            ? {
                prompt: tr.prompt_tokens,
                completion: tr.completion_tokens ?? 0,
              }
            : null,
        cost_usd: tr.cost_usd,
        latency_ms: tr.latency_ms,
        error,
        validator_results,
        judgments,
        aggregate: score
          ? {
              median_overall: score.median_overall,
              disagreement: score.disagreement,
              flagged: score.disagreement > 3,
            }
          : null,
      };
    });

    let bundle_run_score: number | null = null;
    if (
      run.status === "completed" ||
      run.status === "cancelled" ||
      run.status === "incomplete"
    ) {
      const brs = prepare(
        `SELECT AVG(overall_score) AS s FROM bundle_run_scores
         WHERE run_id = ? AND overall_score IS NOT NULL`,
      ).get(id) as { s: number | null };
      bundle_run_score = brs.s;
    }

    let parameters: Record<string, unknown> = {};
    try {
      parameters = JSON.parse(run.parameters_json) as Record<string, unknown>;
    } catch {
      parameters = {};
    }

    return Response.json({
      run: {
        id: run.id,
        bundle_id: bundle?.slug ?? run.bundle_id,
        bundle_hash: run.bundle_hash,
        seed: run.seed,
        status: run.status,
        parameters,
        budget_usd: run.budget_usd,
        total_cost_usd: run.total_cost_usd,
        started_at: isoFromMs(run.started_at),
        finished_at: isoFromMs(run.finished_at),
        last_event_id: run.last_event_id,
      },
      candidates,
      judge_pool,
      panels: [...panelMap.values()],
      task_results,
      bundle_run_score,
    });
  } catch (err) {
    console.error("[api/runs/[id]]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
