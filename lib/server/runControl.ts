import { prepare } from "@/lib/db";
import { ForbiddenError, requireSession, type AppUser } from "@/lib/server/session";
import { canAccessAdmin } from "@/lib/staff";

export function canControlRun(
  user: AppUser | null | undefined,
  launchedByUserId: string | null | undefined,
): boolean {
  if (!user) return false;
  if (canAccessAdmin(user)) return true;
  return launchedByUserId != null && launchedByUserId === user.id;
}

export async function requireRunControl(
  request: Request,
  runId: string,
): Promise<{ user: AppUser; run: { id: string; status: string; launched_by_user_id: string | null } }> {
  const user = await requireSession(request);
  const run = prepare(
    `SELECT id, status, launched_by_user_id FROM runs WHERE id = ?`,
  ).get(runId) as
    | { id: string; status: string; launched_by_user_id: string | null }
    | undefined;
  if (!run) {
    throw Object.assign(new Error("No run with that id"), {
      code: "RUN_NOT_FOUND",
    });
  }
  if (!canControlRun(user, run.launched_by_user_id)) {
    throw new ForbiddenError(
      run.launched_by_user_id
        ? "Only the person who launched this run can control it."
        : "This run has no launcher. Staff can pause or cancel it.",
    );
  }
  return { user, run };
}
