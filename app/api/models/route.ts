import {
  apiError,
  getKeyFromRequest,
  needsKeyError,
} from "@/lib/api-helpers";
import { getModelCatalog, hasApiKey, OpenRouterError } from "@/lib/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";
    const userKey = getKeyFromRequest(request);

    // Force refresh always needs a resolvable key.
    if (forceRefresh && !hasApiKey(userKey)) {
      return needsKeyError(
        "Add your OpenRouter API key in Settings to refresh the model catalog.",
      );
    }

    const catalog = await getModelCatalog({ forceRefresh, apiKey: userKey });
    return Response.json({
      source: catalog.source,
      fetched_at: catalog.fetched_at,
      models: catalog.models,
    });
  } catch (err) {
    if (err instanceof OpenRouterError) {
      if (err.kind === "missing_key") {
        return needsKeyError(
          "Add your OpenRouter API key in Settings to load the model catalog.",
        );
      }
      return apiError(
        "UPSTREAM_ERROR",
        502,
        err.message || "OpenRouter catalog unavailable",
      );
    }
    console.error("[api/models]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
