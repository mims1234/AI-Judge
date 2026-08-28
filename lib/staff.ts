/** Discord snowflake that is always admin. Cannot be demoted. */
export const FOUNDING_ADMIN_DISCORD_ID = "292675388180791297";

export const STAFF_ROLES = ["user", "moderator", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/;

export function isDiscordSnowflake(value: string): boolean {
  return DISCORD_SNOWFLAKE_RE.test(value.trim());
}

export function parseStaffRole(raw: unknown): StaffRole {
  return raw === "admin" || raw === "moderator" ? raw : "user";
}

export function isFoundingAdmin(discordId: string | null | undefined): boolean {
  return discordId === FOUNDING_ADMIN_DISCORD_ID;
}

export function effectiveRole(user: {
  discord_id: string;
  role?: string | null;
}): StaffRole {
  if (isFoundingAdmin(user.discord_id)) return "admin";
  return parseStaffRole(user.role);
}

export function canAccessAdmin(user: {
  discord_id: string;
  role?: string | null;
} | null): boolean {
  if (!user) return false;
  const role = effectiveRole(user);
  return role === "admin" || role === "moderator";
}

export function canManageStaff(user: {
  discord_id: string;
  role?: string | null;
} | null): boolean {
  if (!user) return false;
  return effectiveRole(user) === "admin";
}

export type StaffMember = {
  id: string;
  discord_id: string;
  username: string;
  avatar_url: string | null;
  role: "admin" | "moderator";
  locked: boolean;
};
