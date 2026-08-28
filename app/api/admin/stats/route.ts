import { z } from "zod";
import { apiError, parseQuery } from "@/lib/api-helpers";
import { mapThrownApiError } from "@/lib/server/httpErrors";
import { requireStaff } from "@/lib/server/staff";
import { getTrafficStats } from "@/lib/server/traffic";
import { isTrafficRangeDays } from "@/lib/traffic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  days: z.string().optional(),
});

/** GET /api/admin/stats — daily rollups for the admin dashboard. */
export async function GET(request: Request) {
  try {
    await requireStaff(request);
    const url = new URL(request.url);
    const parsed = parseQuery(QuerySchema, url.searchParams);
    if (!parsed.ok) return parsed.response;

    const n = parsed.data.days ? Number(parsed.data.days) : 30;
    if (!isTrafficRangeDays(n)) {
      return apiError("VALIDATION_ERROR", 400, "days must be 7, 30, or 90");
    }

    return Response.json(getTrafficStats(n));
  } catch (err) {
    return mapThrownApiError(err);
  }
}
