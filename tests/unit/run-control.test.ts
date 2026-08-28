import { describe, expect, it } from "vitest";
import { canControlRun } from "@/lib/server/runControl";
import type { AppUser } from "@/lib/server/users";
import { FOUNDING_ADMIN_DISCORD_ID } from "@/lib/staff";

function user(partial: Partial<AppUser> & Pick<AppUser, "id" | "discord_id">): AppUser {
  return {
    username: "x",
    avatar_url: null,
    created_at: 0,
    role: "user",
    ...partial,
  };
}

describe("canControlRun", () => {
  it("lets the launcher control their run", () => {
    const alice = user({ id: "a", discord_id: "1" });
    expect(canControlRun(alice, "a")).toBe(true);
    expect(canControlRun(alice, "b")).toBe(false);
  });

  it("denies everyone except staff when the launcher is missing", () => {
    const alice = user({ id: "a", discord_id: "1" });
    expect(canControlRun(alice, null)).toBe(false);
    expect(canControlRun(null, null)).toBe(false);
    const staff = user({
      id: "s",
      discord_id: FOUNDING_ADMIN_DISCORD_ID,
      role: "admin",
    });
    expect(canControlRun(staff, null)).toBe(true);
  });
});
