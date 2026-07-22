import { apiError, parseBody } from "@/lib/api-helpers";
import { AppSettingsSchema } from "@/lib/settings";
import { getAppSettings, saveAppSettings } from "@/lib/server/appSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings — operator run defaults (plans/08 §4.2, owned by Frontend).
 * Creates defaults on first read.
 */
export async function GET() {
  try {
    return Response.json(getAppSettings());
  } catch (err) {
    console.error("[api/settings GET]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}

/** PUT /api/settings — Zod-validated persist into app_settings. */
export async function PUT(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", 400, "Invalid JSON body");
    }

    const parsed = parseBody(AppSettingsSchema, raw);
    if (!parsed.ok) return parsed.response;

    const saved = saveAppSettings(parsed.data);
    return Response.json(saved);
  } catch (err) {
    console.error("[api/settings PUT]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
