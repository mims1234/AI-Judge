import { apiError } from "@/lib/api-helpers";
import { getModelCatalog, hasApiKey, OpenRouterError } from "@/lib/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    const catalog = await getModelCatalog({ forceRefresh });
    return Response.json({
      source: catalog.source,
      fetched_at: catalog.fetched_at,
      models: catalog.models,
    });
  } catch (err) {
    if (err instanceof OpenRouterError) {
      if (err.kind === "missing_key" || !hasApiKey()) {
        return apiError(
          "NO_API_KEY",
          503,
          "OPENROUTER_API_KEY is not configured",
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
