import { withBundleMeta } from "@/lib/server/bundles";
import { publishCustomDraft } from "@/lib/server/customBundles";
import { mapThrownApiError } from "@/lib/server/httpErrors";
import { requireSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Params) {
  try {
    const user = await requireSession(request);
    const { id } = await ctx.params;
    const bundle = publishCustomDraft(id, user.id);
    return Response.json({ bundle: withBundleMeta(bundle) });
  } catch (err) {
    return mapThrownApiError(err);
  }
}
