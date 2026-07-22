import { checkKeyStatus, hasApiKey } from "@/lib/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/settings/test-key — server-side OpenRouter key test (plans/08 §4.2,
 * owned by Frontend). Returns { ok, latencyMs?, error? }; never the key.
 */
export async function POST() {
  if (!hasApiKey()) {
    return Response.json({
      ok: false,
      error: "OPENROUTER_API_KEY is not configured — set it in .env.local and restart the server.",
    });
  }

  const started = Date.now();
  try {
    const status = await checkKeyStatus();
    const latencyMs = Date.now() - started;
    if (status.state === "ok") {
      return Response.json({ ok: true, latencyMs });
    }
    if (status.state === "invalid") {
      return Response.json({ ok: false, latencyMs, error: `Key rejected — ${status.message}` });
    }
    return Response.json({ ok: false, latencyMs, error: "OPENROUTER_API_KEY is not configured." });
  } catch (err) {
    return Response.json({
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : "Could not reach OpenRouter",
    });
  }
}
