import { apiError, parseBody } from "@/lib/api-helpers";
import { AppSettingsSchema } from "@/lib/settings";
import { getAppSettings, saveAppSettings } from "@/lib/server/appSettings";
import { mapThrownApiError } from "@/lib/server/httpErrors";
import { requireSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings — operator run defaults (plans/08 §4.2, owned by Frontend).
 * Creates defaults on first read.
 */
export async function GET(request: Request) {
  try {
    await requireSession(request);
    return Response.json(getAppSettings());
  } catch (err) {
    return mapThrownApiError(err);
  }
}

/** PUT /api/settings — Zod-validated persist into app_settings. */
export async function PUT(request: Request) {
  try {
    await requireSession(request);
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
    return mapThrownApiError(err);
  }
}
