import { z } from "zod";
import { apiError, parseBody, parseQuery } from "@/lib/api-helpers";
import { mapThrownApiError } from "@/lib/server/httpErrors";
import {
  grantModerator,
  listStaff,
  requireAdmin,
  requireStaff,
  revokeModerator,
  toStaffMember,
} from "@/lib/server/staff";
import { DISCORD_SNOWFLAKE_RE } from "@/lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GrantSchema = z.object({
  discord_id: z.string().regex(DISCORD_SNOWFLAKE_RE, "Enter a Discord user ID"),
  username: z.string().trim().max(32).optional(),
});

const RevokeSchema = z.object({
  discord_id: z.string().regex(DISCORD_SNOWFLAKE_RE, "Enter a Discord user ID"),
});

/** GET /api/admin/staff — staff roster (admin + moderators). */
export async function GET(request: Request) {
  try {
    await requireStaff(request);
    return Response.json({ staff: listStaff() });
  } catch (err) {
    return mapThrownApiError(err);
  }
}

/** POST /api/admin/staff — grant moderator (admin only). */
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", 400, "Invalid JSON body");
    }
    const parsed = parseBody(GrantSchema, raw);
    if (!parsed.ok) return parsed.response;

    const user = grantModerator(parsed.data.discord_id, parsed.data.username);
    const member = toStaffMember(user);
    return Response.json({ staff: member }, { status: 201 });
  } catch (err) {
    return mapThrownApiError(err);
  }
}

/** DELETE /api/admin/staff?discord_id= — revoke moderator (admin only). */
export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const parsed = parseQuery(RevokeSchema, url.searchParams);
    if (!parsed.ok) return parsed.response;
    revokeModerator(parsed.data.discord_id);
    return Response.json({ ok: true });
  } catch (err) {
    return mapThrownApiError(err);
  }
}
