import {
  apiError,
  parseBody,
} from "@/lib/api-helpers";
import { CreateCustomBundleSchema } from "@/lib/schemas";
import { withBundleMeta } from "@/lib/server/bundles";
import { createCustomDraft } from "@/lib/server/customBundles";
import { mapThrownApiError } from "@/lib/server/httpErrors";
import { requireSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireSession(request);
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", 400, "Invalid JSON body");
    }
    const parsed = parseBody(CreateCustomBundleSchema, raw);
    if (!parsed.ok) return parsed.response;

    const bundle = createCustomDraft({
      authorId: user.id,
      name: parsed.data.name,
      brief: parsed.data.brief,
      reference_notes: parsed.data.reference_notes,
      generator_model_id: parsed.data.generator_model_id ?? null,
      tasks: parsed.data.tasks,
    });

    return Response.json({ bundle: withBundleMeta(bundle) }, { status: 201 });
  } catch (err) {
    return mapThrownApiError(err);
  }
}
