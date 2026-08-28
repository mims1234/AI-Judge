import { canAccessAdmin, canManageStaff, effectiveRole } from "@/lib/staff";
import { mapThrownApiError } from "@/lib/server/httpErrors";
import { getSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me — session role for nav (fresh from SQLite, not only the JWT). */
export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return Response.json({
        user: null,
        canAccessAdmin: false,
        canManageStaff: false,
      });
    }
    return Response.json({
      user: {
        id: user.id,
        username: user.username,
        discord_id: user.discord_id,
        role: effectiveRole(user),
      },
      canAccessAdmin: canAccessAdmin(user),
      canManageStaff: canManageStaff(user),
    });
  } catch (err) {
    return mapThrownApiError(err);
  }
}
