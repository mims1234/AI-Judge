import {
  apiError,
  getKeyFromRequest,
  needsKeyError,
} from "@/lib/api-helpers";
import { prepare } from "@/lib/db";
import { hasApiKey } from "@/lib/openrouter";
import { getRunEngine, InvalidStateError } from "@/lib/run-engine";
import { mapThrownApiError } from "@/lib/server/httpErrors";
import { requireRunControl } from "@/lib/server/runControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    await requireRunControl(request, id);

    const userKey = getKeyFromRequest(request);
    if (!hasApiKey(userKey)) {
      return needsKeyError(
        "Add your OpenRouter API key in Settings before resuming a run.",
      );
    }

    getRunEngine().bindApiKey(id, userKey);
    getRunEngine().resume(id);
    const updated = prepare(`SELECT status FROM runs WHERE id = ?`).get(id) as {
      status: string;
    };
    return Response.json({ run_id: id, status: updated.status });
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return apiError("INVALID_STATE", 409, err.message);
    }
    return mapThrownApiError(err);
  }
}
