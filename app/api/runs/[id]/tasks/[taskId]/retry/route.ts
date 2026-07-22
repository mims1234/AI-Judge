import { apiError } from "@/lib/api-helpers";
import { prepare } from "@/lib/db";
import { getRunEngine, InvalidStateError } from "@/lib/run-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; taskId: string }> };

export async function POST(_request: Request, ctx: Params) {
  try {
    const { id, taskId } = await ctx.params;
    const run = prepare(`SELECT id, status FROM runs WHERE id = ?`).get(id) as
      | { id: string; status: string }
      | undefined;
    if (!run) {
      return apiError("RUN_NOT_FOUND", 404, `No run with id ${id}`);
    }

    const tr = prepare(
      `SELECT id, status FROM task_results WHERE id = ? AND run_id = ?`,
    ).get(taskId, id) as { id: string; status: string } | undefined;
    if (!tr) {
      return apiError("TASK_NOT_FOUND", 404, `No task result with id ${taskId}`);
    }

    if (
      run.status !== "completed" &&
      run.status !== "incomplete" &&
      run.status !== "running" &&
      run.status !== "paused"
    ) {
      return apiError(
        "INVALID_STATE",
        409,
        `cannot retry a task when run is ${run.status}`,
      );
    }
    if (tr.status !== "error") {
      return apiError(
        "INVALID_STATE",
        409,
        `cannot retry a task in status ${tr.status}`,
      );
    }

    getRunEngine().retryTask(id, taskId);
    return Response.json(
      {
        run_id: id,
        task_result_id: taskId,
        status: "pending" as const,
      },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return apiError("INVALID_STATE", 409, err.message);
    }
    console.error("[api/runs/retry]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
