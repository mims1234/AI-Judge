import { afterEach, describe, expect, it } from "vitest";
import {
  AuthRequiredError,
  getSessionUser,
  requireSession,
  setTestSession,
  TEST_USER_HEADER,
} from "@/lib/server/session";
import { upsertDevUser, upsertUser } from "@/lib/server/users";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("session helpers", () => {
  let tdb: TestDb;
  afterEach(() => {
    setTestSession(null);
    tdb?.cleanup();
  });

  it("requireSession throws AuthRequiredError when logged out", async () => {
    tdb = createTestDb();
    setTestSession(null);
    await expect(requireSession()).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("requireSession returns the test session user", async () => {
    tdb = createTestDb();
    const user = upsertDevUser("Tester");
    setTestSession(user);
    await expect(requireSession()).resolves.toMatchObject({
      id: user.id,
      username: "Tester",
      discord_id: "dev",
    });
  });

  it("allows the test user header inside Vitest only", async () => {
    tdb = createTestDb();
    const user = upsertDevUser("Header");
    const req = new Request("http://localhost/api/admin/stats", {
      headers: { [TEST_USER_HEADER]: user.id },
    });
    // Under Vitest the header still works so route tests can spoof a user.
    // next dev/start never take this branch (process.env.VITEST unset).
    await expect(getSessionUser(req)).resolves.toMatchObject({ id: user.id });
  });

  it("upsertUser refreshes username on later sign-in", () => {
    tdb = createTestDb();
    const first = upsertUser({
      discord_id: "d-1",
      username: "Old",
      avatar_url: null,
    });
    const second = upsertUser({
      discord_id: "d-1",
      username: "New",
      avatar_url: "https://example.com/a.png",
    });
    expect(second.id).toBe(first.id);
    expect(second.username).toBe("New");
    expect(second.avatar_url).toBe("https://example.com/a.png");
  });
});
