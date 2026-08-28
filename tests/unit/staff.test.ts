import { afterEach, describe, expect, it } from "vitest";
import {
  grantModerator,
  listStaff,
  revokeModerator,
} from "@/lib/server/staff";
import { ForbiddenError, setTestSession } from "@/lib/server/session";
import { upsertUser } from "@/lib/server/users";
import {
  FOUNDING_ADMIN_DISCORD_ID,
  canAccessAdmin,
  canManageStaff,
  effectiveRole,
  isDiscordSnowflake,
} from "@/lib/staff";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("staff roles", () => {
  let tdb: TestDb;
  afterEach(() => {
    setTestSession(null);
    tdb?.cleanup();
  });

  it("treats the founding Discord id as admin even if the row says user", () => {
    tdb = createTestDb();
    const user = upsertUser({
      discord_id: FOUNDING_ADMIN_DISCORD_ID,
      username: "Owner",
      avatar_url: null,
    });
    expect(user.role).toBe("admin");
    expect(effectiveRole(user)).toBe("admin");
    expect(canAccessAdmin(user)).toBe(true);
    expect(canManageStaff(user)).toBe(true);
  });

  it("keeps ordinary users off the dashboard", () => {
    tdb = createTestDb();
    const user = upsertUser({
      discord_id: "111111111111111111",
      username: "Normie",
      avatar_url: null,
    });
    expect(user.role).toBe("user");
    expect(canAccessAdmin(user)).toBe(false);
    expect(canManageStaff(user)).toBe(false);
  });

  it("lets an admin grant and revoke a moderator who has not signed in yet", () => {
    tdb = createTestDb();
    upsertUser({
      discord_id: FOUNDING_ADMIN_DISCORD_ID,
      username: "Owner",
      avatar_url: null,
    });

    const mod = grantModerator("222222222222222222", "Pat");
    expect(mod.role).toBe("moderator");
    expect(canAccessAdmin(mod)).toBe(true);
    expect(canManageStaff(mod)).toBe(false);

    const roster = listStaff();
    expect(roster.some((r) => r.discord_id === "222222222222222222")).toBe(true);
    expect(roster.some((r) => r.discord_id === FOUNDING_ADMIN_DISCORD_ID && r.locked)).toBe(
      true,
    );

    revokeModerator("222222222222222222");
    expect(listStaff().some((r) => r.discord_id === "222222222222222222")).toBe(
      false,
    );
  });

  it("refuses to demote the founding admin", () => {
    tdb = createTestDb();
    upsertUser({
      discord_id: FOUNDING_ADMIN_DISCORD_ID,
      username: "Owner",
      avatar_url: null,
    });
    expect(() => revokeModerator(FOUNDING_ADMIN_DISCORD_ID)).toThrow(
      ForbiddenError,
    );
    expect(() => grantModerator(FOUNDING_ADMIN_DISCORD_ID)).toThrow(
      ForbiddenError,
    );
  });

  it("preserves a granted role across later Discord sign-in", () => {
    tdb = createTestDb();
    grantModerator("333333333333333333", "Kim");
    const after = upsertUser({
      discord_id: "333333333333333333",
      username: "kim-actual",
      avatar_url: "https://example.com/k.png",
    });
    expect(after.role).toBe("moderator");
    expect(after.username).toBe("kim-actual");
  });

  it("accepts Discord snowflakes only", () => {
    expect(isDiscordSnowflake(FOUNDING_ADMIN_DISCORD_ID)).toBe(true);
    expect(isDiscordSnowflake("dev")).toBe(false);
    expect(isDiscordSnowflake("123")).toBe(false);
  });
});
