import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { POST as postJudge } from "@/app/api/chat/sessions/[id]/judge/route";
import { POST as postMessage } from "@/app/api/chat/sessions/[id]/messages/route";
import { POST as postSession } from "@/app/api/chat/sessions/route";
import { prepare } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { setTestSession } from "@/lib/server/session";
import { upsertUser, type AppUser } from "@/lib/server/users";
import { FOUNDING_ADMIN_DISCORD_ID } from "@/lib/staff";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";
import { startMockOpenRouter } from "@/tests/integration/helpers/mock-openrouter";

/** Only the person who started a chat (or staff) may add turns or judge it. */

const CANDIDATE = "mock/cand-a";
const JUDGES = ["mock/judge-1", "mock/judge-2", "mock/judge-3"];

function seedModels(): void {
  const upsert = prepare(`
    INSERT INTO models_cache (openrouter_id, name, context_length, pricing_json, raw_json, fetched_at)
    VALUES (@id, @name, 128000, @pricing, @raw, @fetched)
    ON CONFLICT(openrouter_id) DO UPDATE SET fetched_at = excluded.fetched_at
  `);
  for (const id of [CANDIDATE, ...JUDGES]) {
    upsert.run({
      id,
      name: id,
      pricing: JSON.stringify({ prompt_usd_per_m: 1, completion_usd_per_m: 2 }),
      raw: JSON.stringify({ supported_parameters: ["response_format"] }),
      fetched: Date.now(),
    });
  }
}

function user(name: string): AppUser {
  return upsertUser({
    discord_id: `d-${name.toLowerCase()}`,
    username: name,
    avatar_url: null,
  });
}

function post(body?: unknown): Request {
  return new Request("http://local/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-openrouter-key": "k" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** The reply streams in the background; let it finish before the DB goes away. */
async function replyFinished(sessionId: string): Promise<void> {
  const started = Date.now();
  for (;;) {
    const row = prepare(
      `SELECT s.status AS status,
              (SELECT COUNT(*) FROM chat_messages m
                WHERE m.session_id = s.id AND m.role = 'assistant' AND m.content != '') AS replies
       FROM chat_sessions s WHERE s.id = ?`,
    ).get(sessionId) as { status: string; replies: number };
    if (row.status === "active" && row.replies > 0) return;
    if (Date.now() - started > 10_000) throw new Error("reply did not finish");
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function errorCode(res: Response): Promise<string | undefined> {
  const json = (await res.json()) as { error?: { code?: string } };
  return json.error?.code;
}

describe("chat session ownership", () => {
  let tdb: TestDb;
  let mock: Awaited<ReturnType<typeof startMockOpenRouter>> | null = null;
  const savedBase = process.env.OPENROUTER_BASE_URL;

  afterEach(async () => {
    setTestSession(null);
    process.env.OPENROUTER_BASE_URL = savedBase;
    resetEnvCache();
    tdb?.cleanup();
    await mock?.close().catch(() => undefined);
    mock = null;
  });

  async function setup(): Promise<void> {
    tdb = createTestDb();
    seedModels();
    mock = await startMockOpenRouter();
    mock.setDefaultChat({
      kind: "sse",
      fixtureRelPath: "sse/chat-assistant-reply.sse",
    });
    process.env.OPENROUTER_BASE_URL = mock.url;
    resetEnvCache();
  }

  async function createSession(): Promise<string> {
    const res = await postSession(
      post({ candidate_model_id: CANDIDATE, judge_pool_model_ids: JUDGES }),
    );
    expect(res.status).toBe(201);
    return ((await res.json()) as { session_id: string }).session_id;
  }

  it("records the creator and rejects other users", async () => {
    await setup();
    const alice = user("Alice");
    const bob = user("Bob");

    setTestSession(alice);
    const sessionId = await createSession();
    const row = prepare(`SELECT user_id FROM chat_sessions WHERE id = ?`).get(
      sessionId,
    ) as { user_id: string | null };
    expect(row.user_id).toBe(alice.id);

    setTestSession(bob);
    const msg = await postMessage(post({ content: "hijack" }), params(sessionId));
    expect(msg.status).toBe(403);
    expect(await errorCode(msg)).toBe("FORBIDDEN");
    const judge = await postJudge(post(), params(sessionId));
    expect(judge.status).toBe(403);

    const turns = prepare(
      `SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ?`,
    ).get(sessionId) as { n: number };
    expect(turns.n).toBe(0);

    setTestSession(alice);
    const own = await postMessage(post({ content: "hello" }), params(sessionId));
    expect(own.status).toBe(201);
    await replyFinished(sessionId);
  });

  it("keeps chats without an owner read-only, except for staff", async () => {
    await setup();
    const alice = user("Alice");
    const staff = upsertUser({
      discord_id: FOUNDING_ADMIN_DISCORD_ID,
      username: "Admin",
      avatar_url: null,
    });

    const legacyId = randomUUID();
    prepare(
      `INSERT INTO chat_sessions (
        id, candidate_model_id, judge_pool_json, status, judging_rounds,
        total_cost_usd, last_event_id, created_at
      ) VALUES (?, ?, ?, 'active', 0, 0, 0, ?)`,
    ).run(legacyId, CANDIDATE, JSON.stringify(JUDGES), Date.now());

    setTestSession(alice);
    const denied = await postMessage(post({ content: "hi" }), params(legacyId));
    expect(denied.status).toBe(403);

    setTestSession(staff);
    const allowed = await postMessage(post({ content: "hi" }), params(legacyId));
    expect(allowed.status).toBe(201);
    await replyFinished(legacyId);
  });

  it("returns 404 for an unknown session and 401 when signed out", async () => {
    await setup();
    setTestSession(user("Alice"));
    const missing = await postJudge(post(), params(randomUUID()));
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("SESSION_NOT_FOUND");

    setTestSession(null);
    const anon = await postMessage(post({ content: "hi" }), params(randomUUID()));
    expect(anon.status).toBe(401);
  });
});
