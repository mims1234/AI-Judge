import {
  apiError,
  parseBody,
} from "@/lib/api-helpers";
import { UpdateCustomBundleSchema } from "@/lib/schemas";
import {
  getBundleBySlugOrId,
  getBundleTasks,
  parseMustMention,
  withBundleMeta,
} from "@/lib/server/bundles";
import {
  deleteCustomDraft,
  updateCustomDraft,
} from "@/lib/server/customBundles";
import { mapThrownApiError } from "@/lib/server/httpErrors";
import { getSessionUser, requireSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Params) {
  const { id } = await ctx.params;
  const bundle = getBundleBySlugOrId(id);
  if (!bundle) return apiError("BUNDLE_NOT_FOUND", 404, "Bundle not found");

  const user = await getSessionUser(request);
  const isOwner = Boolean(user && bundle.author_user_id === user.id);
  if (bundle.status !== "published" && !isOwner) {
    return apiError("BUNDLE_NOT_FOUND", 404, "Bundle not found");
  }

  const tasks = getBundleTasks(bundle.id).map((t) => ({
    category: t.category,
    task_body: t.task_body,
    must_mention: parseMustMention(t.must_mention_json),
    token_limit: t.token_limit,
    wrapper: t.wrapper,
  }));
  return Response.json({ bundle: withBundleMeta(bundle), tasks });
}

export async function PUT(request: Request, ctx: Params) {
  try {
    const user = await requireSession(request);
    const { id } = await ctx.params;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", 400, "Invalid JSON body");
    }
    const parsed = parseBody(UpdateCustomBundleSchema, raw);
    if (!parsed.ok) return parsed.response;
    const bundle = updateCustomDraft(id, user.id, parsed.data);
    return Response.json({ bundle: withBundleMeta(bundle) });
  } catch (err) {
    return mapThrownApiError(err);
  }
}

export async function DELETE(request: Request, ctx: Params) {
  try {
    const user = await requireSession(request);
    const { id } = await ctx.params;
    deleteCustomDraft(id, user.id);
    return Response.json({ ok: true });
  } catch (err) {
    return mapThrownApiError(err);
  }
}
