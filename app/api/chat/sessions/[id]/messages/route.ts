import {
  apiError,
  getKeyFromRequest,
  needsKeyError,
  parseBody,
} from "@/lib/api-helpers";
import { ChatStateError, getChatEngine } from "@/lib/chat-engine";
import { prepare } from "@/lib/db";
import { hasApiKey } from "@/lib/openrouter";
import { PostChatMessageRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const userKey = getKeyFromRequest(request);
    if (!hasApiKey(userKey)) {
      return needsKeyError("Add your OpenRouter API key in Settings to chat.");
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", 400, "Invalid JSON body");
    }
    const parsed = parseBody(PostChatMessageRequestSchema, raw);
    if (!parsed.ok) return parsed.response;

    const session = prepare(
      `SELECT id FROM chat_sessions WHERE id = ?`,
    ).get(id) as { id: string } | undefined;
    if (!session) {
      return apiError("SESSION_NOT_FOUND", 404, `No chat session with id ${id}`);
    }

    const engine = getChatEngine();
    let messageId: string;
    try {
      messageId = engine.postUserMessage(id, parsed.data.content).messageId;
      engine.sendMessage(id, userKey);
    } catch (err) {
      if (err instanceof ChatStateError) {
        return apiError("INVALID_STATE", 409, err.message);
      }
      throw err;
    }

    return Response.json(
      { message_id: messageId, events_url: `/api/chat/sessions/${id}/events` },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api/chat/sessions/[id]/messages POST]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
