import { randomUUID } from "node:crypto";
import {
  apiError,
  getKeyFromRequest,
  needsKeyError,
  parseBody,
} from "@/lib/api-helpers";
import { prepare } from "@/lib/db";
import { getCachedModel, getModelCatalog, hasApiKey } from "@/lib/openrouter";
import { CreateChatSessionRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userKey = getKeyFromRequest(request);
    if (!hasApiKey(userKey)) {
      return needsKeyError(
        "Add your OpenRouter API key in Settings before starting a chat.",
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", 400, "Invalid JSON body");
    }

    const parsed = parseBody(CreateChatSessionRequestSchema, raw);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    // Validate models against the catalog. Structured outputs are preferred
    // but not required — judges without them use the prompt + schema-retry path.
    await getModelCatalog({ apiKey: userKey });
    const candidate = getCachedModel(body.candidate_model_id);
    if (!candidate) {
      return apiError(
        "MODEL_UNAVAILABLE",
        409,
        `Unknown candidate model ${body.candidate_model_id}`,
      );
    }
    // Defense in depth: schema already rejects overlap; keep an explicit
    // API check so self-judging cannot sneak in via older clients.
    if (body.judge_pool_model_ids.includes(body.candidate_model_id)) {
      return apiError(
        "VALIDATION_ERROR",
        400,
        "Candidate model cannot also be in the judge pool",
        { model_id: body.candidate_model_id },
      );
    }

    const missingJudges = body.judge_pool_model_ids.filter(
      (id) => !getCachedModel(id),
    );
    if (missingJudges.length > 0) {
      return apiError(
        "MODEL_UNAVAILABLE",
        409,
        "Unknown judge model(s) in pool",
        { judges: missingJudges },
      );
    }

    const sessionId = randomUUID();
    prepare(
      `INSERT INTO chat_sessions (
        id, candidate_model_id, judge_pool_json, status, judging_rounds,
        total_cost_usd, last_event_id, created_at
      ) VALUES (?, ?, ?, 'active', 0, 0, 0, ?)`,
    ).run(
      sessionId,
      body.candidate_model_id,
      JSON.stringify(body.judge_pool_model_ids),
      Date.now(),
    );

    return Response.json(
      {
        session_id: sessionId,
        status: "active" as const,
        events_url: `/api/chat/sessions/${sessionId}/events`,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api/chat/sessions POST]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
