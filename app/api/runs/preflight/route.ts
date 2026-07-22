import {
  apiError,
  getKeyFromRequest,
  needsKeyError,
  parseBody,
} from "@/lib/api-helpers";
import { hasApiKey } from "@/lib/openrouter";
import { PreflightRequestSchema } from "@/lib/schemas";
import { evaluatePreflight } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userKey = getKeyFromRequest(request);
    if (!hasApiKey(userKey)) {
      return needsKeyError(
        "Add your OpenRouter API key in Settings before running a preflight check.",
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", 400, "Invalid JSON body", {
        issues: [],
      });
    }

    const parsed = parseBody(PreflightRequestSchema, raw);
    if (!parsed.ok) return parsed.response;

    // Ensure catalog is warm enough for getCachedModel
    const { getModelCatalog } = await import("@/lib/openrouter");
    await getModelCatalog({ apiKey: userKey });

    const result = evaluatePreflight(parsed.data);
    return Response.json({
      ok: result.ok,
      seed: result.seed,
      errors: result.errors,
      warnings: result.warnings,
      estimate: {
        request_count: result.estimate.request_count,
        candidate_requests: result.estimate.candidate_requests,
        judge_requests: result.estimate.judge_requests,
        prompt_tokens_est: result.estimate.prompt_tokens_est,
        completion_tokens_est: result.estimate.completion_tokens_est,
        cost_usd_min: result.estimate.cost_usd_min,
        cost_usd_expected: result.estimate.cost_usd_expected,
        cost_usd_max: result.estimate.cost_usd_max,
        duration_est_seconds: result.estimate.duration_est_seconds,
        unpriced_models: result.estimate.unpriced_models,
      },
    });
  } catch (err) {
    console.error("[api/runs/preflight]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
