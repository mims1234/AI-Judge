import { apiError } from "@/lib/api-helpers";
import { getRunSnapshot } from "@/lib/server/runSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const snapshot = getRunSnapshot(id);
    if (!snapshot) {
      return apiError("RUN_NOT_FOUND", 404, `No run with id ${id}`);
    }
    return Response.json(snapshot);
  } catch (err) {
    console.error("[api/runs/[id]]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
