import { apiError, csvRow, parseQuery } from "@/lib/api-helpers";
import { prepare } from "@/lib/db";
import { ExportQuerySchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const url = new URL(request.url);
    const parsed = parseQuery(ExportQuerySchema, url.searchParams);
    if (!parsed.ok) return parsed.response;

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
    if (!run) {
      return apiError("RUN_NOT_FOUND", 404, `No run with id ${id}`);
    }
    if (run.status === "queued") {
      return apiError(
        "INVALID_STATE",
        409,
        "cannot export a run in status queued",
      );
    }

    const allAttempts = prepare(
      `SELECT ja.*, tr.task_id, tr.candidate_model_id, tr.trial_index, t.category
       FROM judgment_attempts ja
       JOIN task_results tr ON tr.id = ja.task_result_id
       JOIN tasks t ON t.id = tr.task_id
       WHERE tr.run_id = ?
       ORDER BY ja.created_at ASC`,
    ).all(id) as Array<Record<string, unknown>>;

    if (parsed.data.format === "json") {
      const snapMod = await import("../route");
      const snapRes = await snapMod.GET(
        new Request(`http://local/api/runs/${id}`),
        ctx,
      );
      if (!snapRes.ok) return snapRes;
      const snapshot = (await snapRes.json()) as Record<string, unknown>;

      const body = {
        ...snapshot,
        judgment_attempts: allAttempts,
        export_meta: {
          exported_at: new Date().toISOString(),
          app_version: "0.1.0",
          bundle_hash: run.bundle_hash,
          seed: run.seed,
        },
      };
      return new Response(JSON.stringify(body, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="ai-judge-run-${id}.json"`,
        },
      });
    }

    const header = [
      "run_id",
      "bundle_id",
      "bundle_hash",
      "seed",
      "task_id",
      "category",
      "candidate_model_id",
      "trial_index",
      "task_status",
      "validator_pass_count",
      "validator_fail_count",
      "judge_model_id",
      "is_substitute",
      "parse_status",
      "correctness",
      "requirement_compliance",
      "quality",
      "honesty",
      "claimed_overall",
      "computed_overall",
      "verdict",
      "median_overall",
      "disagreement",
      "tokens_prompt",
      "tokens_completion",
      "cost_usd",
      "latency_ms",
    ];

    const taskResults = prepare(
      `SELECT tr.*, t.category FROM task_results tr
       JOIN tasks t ON t.id = tr.task_id WHERE tr.run_id = ?`,
    ).all(id) as Array<{
      id: string;
      task_id: string;
      category: string;
      candidate_model_id: string;
      trial_index: number;
      status: string;
      prompt_tokens: number | null;
      completion_tokens: number | null;
      cost_usd: number | null;
      latency_ms: number | null;
    }>;

    const bundle = prepare(`SELECT slug FROM bundles WHERE id = ?`).get(
      run.bundle_id,
    ) as { slug: string } | undefined;

    const lines = [csvRow(header)];
    for (const tr of taskResults) {
      const vr = prepare(
        `SELECT
           SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS p,
           SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) AS f
         FROM validator_results WHERE task_result_id = ?`,
      ).get(tr.id) as { p: number | null; f: number | null };

      const score = prepare(
        `SELECT median_overall, disagreement FROM task_scores WHERE task_result_id = ?`,
      ).get(tr.id) as
        | { median_overall: number; disagreement: number }
        | undefined;

      const finals = prepare(
        `SELECT * FROM judgment_attempts
         WHERE task_result_id = ? AND is_final = 1`,
      ).all(tr.id) as Array<Record<string, unknown>>;

      const judges =
        finals.length > 0
          ? finals
          : [
              {
                judge_model_id: "",
                is_substitute: 0,
                parse_status: "",
                score_correctness: null,
                score_compliance: null,
                score_quality: null,
                score_honesty: null,
                claimed_overall: null,
                server_overall: null,
                verdict: null,
              },
            ];

      for (const j of judges) {
        lines.push(
          csvRow([
            id,
            bundle?.slug ?? run.bundle_id,
            run.bundle_hash,
            run.seed,
            tr.task_id,
            tr.category,
            tr.candidate_model_id,
            tr.trial_index,
            tr.status,
            vr.p ?? 0,
            vr.f ?? 0,
            j.judge_model_id,
            Number(j.is_substitute) === 1,
            j.parse_status,
            j.score_correctness,
            j.score_compliance,
            j.score_quality,
            j.score_honesty,
            j.claimed_overall,
            j.server_overall,
            j.verdict,
            score?.median_overall ?? "",
            score?.disagreement ?? "",
            tr.prompt_tokens,
            tr.completion_tokens,
            tr.cost_usd,
            tr.latency_ms,
          ]),
        );
      }
    }

    return new Response(lines.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ai-judge-run-${id}.csv"`,
      },
    });
  } catch (err) {
    console.error("[api/runs/export]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
