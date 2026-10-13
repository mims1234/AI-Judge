import {
  apiError,
  getKeyFromRequest,
  needsKeyError,
  parseBody,
} from "@/lib/api-helpers";
import { getChatEngine, isChatStateError } from "@/lib/chat-engine";
import { hasApiKey } from "@/lib/openrouter";
import { PostChatMessageRequestSchema } from "@/lib/schemas";
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
      return needsKeyError("Add your OpenRouter API key to chat.");
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", 400, "Invalid JSON body");
    }
    const parsed = parseBody(PostChatMessageRequestSchema, raw);
    if (!parsed.ok) return parsed.response;

    const engine = getChatEngine();
    let messageId: string;
    try {
      messageId = engine.postUserMessage(id, parsed.data.content).messageId;
      engine.sendMessage(id, userKey);
    } catch (err) {
      if (isChatStateError(err)) {
        return apiError("INVALID_STATE", 409, err.message);
      }
      throw err;
    }

    return Response.json(
      { message_id: messageId, events_url: `/api/chat/sessions/${id}/events` },
      { status: 201 },
    );
  } catch (err) {
    return mapThrownApiError(err);
  }
}
