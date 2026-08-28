import { afterEach, describe, expect, it } from "vitest";
import { GET as getModels } from "@/app/api/models/route";
import { POST as postChatSessions } from "@/app/api/chat/sessions/route";
import { POST as postTestKey } from "@/app/api/settings/test-key/route";
import { setTestSession } from "@/lib/server/session";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("service access APIs", () => {
  let tdb: TestDb;

  afterEach(() => {
    setTestSession(null);
    tdb?.cleanup();
  });

  it("rejects logged-out models, chat, and test-key", async () => {
    tdb = createTestDb();
    setTestSession(null);

    const models = await getModels(new Request("http://local/api/models"));
    expect(models.status).toBe(401);
    expect(((await models.json()) as { error: { code: string } }).error.code).toBe(
      "NEEDS_LOGIN",
    );

    const chat = await postChatSessions(
      new Request("http://local/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_model_id: "mock/cand-a",
          judge_pool_model_ids: ["mock/judge-1", "mock/judge-2", "mock/judge-3"],
        }),
      }),
    );
    expect(chat.status).toBe(401);
    expect(((await chat.json()) as { error: { code: string } }).error.code).toBe(
      "NEEDS_LOGIN",
    );

    const key = await postTestKey(
      new Request("http://local/api/settings/test-key", { method: "POST" }),
    );
    expect(key.status).toBe(401);
    expect(((await key.json()) as { error: { code: string } }).error.code).toBe(
      "NEEDS_LOGIN",
    );
  });
});
