import "server-only";

import {
  canAccessAdmin,
  canManageStaff,
  effectiveRole,
  isDiscordSnowflake,
  isFoundingAdmin,
  type StaffMember,
} from "@/lib/staff";
import {
  getUserByDiscordId,
  insertStaffPlaceholder,
  listStaffUsers,
  setUserRole,
  type AppUser,
} from "@/lib/server/users";
import {
  ForbiddenError,
  requireSession,
} from "@/lib/server/session";

export {
  canAccessAdmin,
  canManageStaff,
  effectiveRole,
  isFoundingAdmin,
};

export type { StaffMember };

export async function requireStaff(request?: Request): Promise<AppUser> {
  const user = await requireSession(request);
  if (!canAccessAdmin(user)) {
    throw new ForbiddenError("You cannot do that.");
  }
  return user;
}

export async function requireAdmin(request?: Request): Promise<AppUser> {
  const user = await requireSession(request);
  if (!canManageStaff(user)) {
    throw new ForbiddenError("Only an admin can do that.");
  }
  return user;
}

export function toStaffMember(user: AppUser): StaffMember | null {
  const role = effectiveRole(user);
  if (role !== "admin" && role !== "moderator") return null;
  return {
    id: user.id,
    discord_id: user.discord_id,
    username: user.username,
    avatar_url: user.avatar_url,
    role,
    locked: isFoundingAdmin(user.discord_id),
  };
}

export function listStaff(): StaffMember[] {
  return listStaffUsers()
    .map(toStaffMember)
    .filter((row): row is StaffMember => row !== null);
}

export function grantModerator(discordId: string, username?: string): AppUser {
  const id = discordId.trim();
  if (!isDiscordSnowflake(id)) {
    const err = new Error("Enter a Discord user ID (17–20 digits).");
    (err as Error & { code: string }).code = "VALIDATION_ERROR";
    throw err;
  }
  if (isFoundingAdmin(id)) {
    throw new ForbiddenError("That account is the site admin.");
  }

  const label = username?.trim().slice(0, 32) || "Moderator";
  const existing = getUserByDiscordId(id);
  if (existing) {
    if (effectiveRole(existing) === "admin") {
      throw new ForbiddenError("Cannot change an admin.");
    }
    setUserRole(existing.id, "moderator");
    return { ...existing, role: "moderator" };
  }

  return insertStaffPlaceholder({
    discord_id: id,
    username: label,
    role: "moderator",
  });
}

export function revokeModerator(discordId: string): void {
  const id = discordId.trim();
  if (isFoundingAdmin(id)) {
    throw new ForbiddenError("The site admin cannot be removed.");
  }
  const existing = getUserByDiscordId(id);
  if (!existing) {
    throw new ForbiddenError("No staff member with that Discord ID.");
  }
  if (effectiveRole(existing) === "admin") {
    throw new ForbiddenError("Cannot change an admin.");
  }
  if (existing.role !== "moderator") {
    throw new ForbiddenError("That person is not a moderator.");
  }
  setUserRole(existing.id, "user");
}
