import {
  apiError,
  getKeyFromRequest,
  needsKeyError,
} from "@/lib/api-helpers";
import { getChatEngine, isChatStateError } from "@/lib/chat-engine";
import { hasApiKey } from "@/lib/openrouter";
import { requireChatControl } from "@/lib/server/chatControl";
import { mapThrownApiError } from "@/lib/server/httpErrors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    await requireChatControl(request, id);
    const userKey = getKeyFromRequest(request);
    if (!hasApiKey(userKey)) {
      return needsKeyError("Add your OpenRouter API key to judge.");
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
    return mapThrownApiError(err);
  }
}
