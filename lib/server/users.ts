import "server-only";

import { randomUUID } from "node:crypto";
import { prepare } from "@/lib/db";
import {
  FOUNDING_ADMIN_DISCORD_ID,
  isFoundingAdmin,
  parseStaffRole,
  type StaffRole,
} from "@/lib/staff";

export const DEV_DISCORD_ID = "dev";

export const USER_SELECT =
  "id, discord_id, username, avatar_url, created_at, role";

export type AppUser = {
  id: string;
  discord_id: string;
  username: string;
  avatar_url: string | null;
  created_at: number;
  role: StaffRole;
};

type UserRow = {
  id: string;
  discord_id: string;
  username: string;
  avatar_url: string | null;
  created_at: number;
  role: string;
};

function mapUser(row: UserRow): AppUser {
  const user: AppUser = {
    id: row.id,
    discord_id: row.discord_id,
    username: row.username,
    avatar_url: row.avatar_url,
    created_at: row.created_at,
    role: parseStaffRole(row.role),
  };
  return ensureFoundingAdmin(user);
}

/** Founding Discord id is always admin in code — not only a row they can edit. */
function ensureFoundingAdmin(user: AppUser): AppUser {
  if (!isFoundingAdmin(user.discord_id) || user.role === "admin") return user;
  prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(user.id);
  return { ...user, role: "admin" };
}

export function getUserById(id: string): AppUser | null {
  const row = prepare(
    `SELECT ${USER_SELECT} FROM users WHERE id = ?`,
  ).get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function getUserByDiscordId(discordId: string): AppUser | null {
  const row = prepare(
    `SELECT ${USER_SELECT} FROM users WHERE discord_id = ?`,
  ).get(discordId) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function upsertUser(input: {
  discord_id: string;
  username: string;
  avatar_url: string | null;
}): AppUser {
  const role: StaffRole = isFoundingAdmin(input.discord_id) ? "admin" : "user";
  prepare(
    `INSERT INTO users (id, discord_id, username, avatar_url, created_at, role)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET
       username = excluded.username,
       avatar_url = excluded.avatar_url`,
  ).run(
    randomUUID(),
    input.discord_id,
    input.username,
    input.avatar_url,
    Date.now(),
    role,
  );
  const user = getUserByDiscordId(input.discord_id);
  if (!user) throw new Error("upsertUser failed");
  return user;
}

export function upsertDevUser(username = "Dev"): AppUser {
  return upsertUser({
    discord_id: DEV_DISCORD_ID,
    username,
    avatar_url: null,
  });
}

export function insertStaffPlaceholder(input: {
  discord_id: string;
  username: string;
  role: Exclude<StaffRole, "user">;
}): AppUser {
  const role: StaffRole = isFoundingAdmin(input.discord_id)
    ? "admin"
    : input.role;
  const row: AppUser = {
    id: randomUUID(),
    discord_id: input.discord_id,
    username: input.username.slice(0, 32),
    avatar_url: null,
    created_at: Date.now(),
    role,
  };
  prepare(
    `INSERT INTO users (id, discord_id, username, avatar_url, created_at, role)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.discord_id,
    row.username,
    row.avatar_url,
    row.created_at,
    row.role,
  );
  return row;
}

export function setUserRole(userId: string, role: StaffRole): void {
  const user = getUserById(userId);
  if (!user) return;
  if (isFoundingAdmin(user.discord_id)) {
    prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(userId);
    return;
  }
  prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, userId);
}

export function listStaffUsers(): AppUser[] {
  const rows = prepare(
    `SELECT ${USER_SELECT}
     FROM users
     WHERE role IN ('admin', 'moderator') OR discord_id = ?
     ORDER BY
       CASE role WHEN 'admin' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END,
       username COLLATE NOCASE`,
  ).all(FOUNDING_ADMIN_DISCORD_ID) as UserRow[];
  return rows.map(mapUser);
}

export function publicUser(user: AppUser): {
  id: string;
  username: string;
  avatar_url: string | null;
} {
  return {
    id: user.id,
    username: user.username,
    avatar_url: user.avatar_url,
  };
}
