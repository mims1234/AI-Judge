import {
  apiError,
  getKeyFromRequest,
  needsKeyError,
} from "@/lib/api-helpers";
import { getChatEngine, isChatStateError } from "@/lib/chat-engine";
import { prepare } from "@/lib/db";
import { hasApiKey } from "@/lib/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const userKey = getKeyFromRequest(request);
    if (!hasApiKey(userKey)) {
      return needsKeyError("Add your OpenRouter API key in Settings to judge.");
    }

    const session = prepare(
      `SELECT id FROM chat_sessions WHERE id = ?`,
    ).get(id) as { id: string } | undefined;
    if (!session) {
      return apiError("SESSION_NOT_FOUND", 404, `No chat session with id ${id}`);
    }

    try {
      getChatEngine().judge(id, userKey);
    } catch (err) {
      if (isChatStateError(err)) {
        return apiError("INVALID_STATE", 409, err.message);
      }
      throw err;
    }

    return Response.json(
      { session_id: id, status: "judging" as const },
      { status: 202 },
    );
  } catch (err) {
    console.error("[api/chat/sessions/[id]/judge POST]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
