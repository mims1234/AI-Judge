import { prepare } from "@/lib/db";
import { ForbiddenError, requireSession, type AppUser } from "@/lib/server/session";
import { canAccessAdmin } from "@/lib/staff";

/**
 * Who may add turns to a chat or re-judge it: the person who started it, or
 * staff. Chats created before ownership existed have no owner and are
 * read-only for everyone except staff.
 */
export function canControlChat(
  user: AppUser | null | undefined,
  ownerUserId: string | null | undefined,
): boolean {
  if (!user) return false;
  if (canAccessAdmin(user)) return true;
  return ownerUserId != null && ownerUserId === user.id;
}

export async function requireChatControl(
  request: Request,
  sessionId: string,
): Promise<{ user: AppUser; session: { id: string; user_id: string | null } }> {
  const user = await requireSession(request);
  const session = prepare(
    `SELECT id, user_id FROM chat_sessions WHERE id = ?`,
  ).get(sessionId) as { id: string; user_id: string | null } | undefined;
  if (!session) {
    throw Object.assign(new Error(`No chat session with id ${sessionId}`), {
      code: "SESSION_NOT_FOUND",
    });
  }
  if (!canControlChat(user, session.user_id)) {
    throw new ForbiddenError(
      session.user_id
        ? "Only the person who started this chat can continue or judge it."
        : "This chat was started before chats had owners, so it is read-only. Start a new chat to continue.",
    );
  }
  return { user, session };
}
