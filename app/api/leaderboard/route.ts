import { apiError, csvRow, parseQuery } from "@/lib/api-helpers";
import { LeaderboardQuerySchema } from "@/lib/schemas";
import { queryLeaderboard } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = parseQuery(LeaderboardQuerySchema, url.searchParams);
    if (!parsed.ok) return parsed.response;

    let result;
    try {
      result = queryLeaderboard(parsed.data.bundle, parsed.data.category);
    } catch (err) {
      if (err instanceof Error && err.message === "BUNDLE_NOT_FOUND") {
        return apiError(
          "BUNDLE_NOT_FOUND",
          404,
          `No bundle with id ${parsed.data.bundle}`,
        );
      }
      throw err;
    }

    if (parsed.data.format === "csv") {
      const header = [
        "rank",
        "model_id",
        "score",
        "provisional",
        "complete_runs",
        "coverage",
        "penalized_tasks",
        "excluded_tasks",
        "disagreement_mean",
        "success_rate",
        "avg_cost_usd_per_run",
        "avg_latency_ms",
        "last_evaluated_at",
      ];
      const lines = [
        csvRow(header),
        ...result.rows.map((r) =>
          csvRow([
            r.rank,
            r.model_id,
            r.score,
            r.provisional,
            r.complete_runs,
            r.coverage,
            r.penalized_tasks,
            r.excluded_tasks,
            r.disagreement_mean,
            r.success_rate,
            r.avg_cost_usd_per_run,
            r.avg_latency_ms,
            r.last_evaluated_at,
          ]),
        ),
      ];
      return new Response(lines.join("\r\n") + "\r\n", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ai-judge-leaderboard-${result.bundle_id}.csv"`,
        },
      });
    }

    return Response.json(result);
  } catch (err) {
    console.error("[api/leaderboard]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
