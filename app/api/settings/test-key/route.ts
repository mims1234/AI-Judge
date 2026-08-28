import { getKeyFromRequest } from "@/lib/api-helpers";
import { checkKeyStatus, hasApiKey } from "@/lib/openrouter";
import { mapThrownApiError } from "@/lib/server/httpErrors";
import { requireSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/settings/test-key — OpenRouter key test (plans/08 §4.2).
 * Accepts optional `x-openrouter-key` (BYOK). Never stores or returns the key.
 */
export async function POST(request: Request) {
  try {
    await requireSession(request);
  } catch (err) {
    return mapThrownApiError(err);
  }

  const userKey = getKeyFromRequest(request);
  if (!hasApiKey(userKey)) {
    return Response.json({
      ok: false,
      error: "No API key available — paste your OpenRouter key.",
    });
  }

  const started = Date.now();
  try {
    const status = await checkKeyStatus(userKey);
    const latencyMs = Date.now() - started;
    if (status.state === "ok") {
      return Response.json({
        ok: true,
        latencyMs,
        label: status.label ?? null,
        usage_usd: status.usage_usd ?? null,
        limit_usd: status.limit_usd ?? null,
        limit_remaining: status.limit_remaining ?? null,
      });
    }
    if (status.state === "invalid") {
      return Response.json({
        ok: false,
        latencyMs,
        error: "Key rejected — check the key and try again.",
      });
    }
    return Response.json({
      ok: false,
      latencyMs,
      error: "No API key available.",
    });
  } catch {
    return Response.json({
      ok: false,
      latencyMs: Date.now() - started,
      error: "Could not reach OpenRouter",
    });
  }
}
