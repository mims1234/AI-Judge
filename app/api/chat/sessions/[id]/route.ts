import { apiError } from "@/lib/api-helpers";
import { getChatSessionSnapshot } from "@/lib/server/chatAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const snapshot = getChatSessionSnapshot(id);
    if (!snapshot) {
      return apiError("SESSION_NOT_FOUND", 404, `No chat session with id ${id}`);
    }
    return Response.json(snapshot);
  } catch (err) {
    console.error("[api/chat/sessions/[id] GET]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
