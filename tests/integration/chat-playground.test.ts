import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  ChatStateError,
  getChatEngine,
  resetChatEngineForTests,
} from "@/lib/chat-engine";
import { prepare } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { getChatSessionSnapshot } from "@/lib/server/chatAnalytics";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";
import { startMockOpenRouter } from "@/tests/integration/helpers/mock-openrouter";

function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 15_000,
): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`timeout waiting for ${label}`));
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

describe("chat playground engine (plans/16 §B2)", () => {
  let tdb: TestDb;
  let mock: Awaited<ReturnType<typeof startMockOpenRouter>> | null = null;

  afterEach(async () => {
    resetChatEngineForTests();
    if (mock) {
      await mock.close();
      mock = null;
    }
    tdb?.cleanup();
    delete process.env.OPENROUTER_BASE_URL;
    resetEnvCache();
  });

  function seedSession(opts?: {
    judges?: string[];
    candidate?: string;
    category?: string | null;
    status?: string;
  }): string {
    const id = randomUUID();
    prepare(
      `INSERT INTO chat_sessions (
        id, candidate_model_id, judge_pool_json, status, category,
        judging_rounds, total_cost_usd, last_event_id, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)`,
    ).run(
      id,
      opts?.candidate ?? "mock/cand-a",
      JSON.stringify(opts?.judges ?? ["mock/judge-1", "mock/judge-2", "mock/judge-3"]),
      opts?.status ?? "active",
      opts?.category ?? null,
      Date.now(),
    );
    return id;
  }

  it("streams a reply, classifies, scores, and persists chat SSE events", async () => {
    tdb = createTestDb();
    mock = await startMockOpenRouter();
    process.env.OPENROUTER_BASE_URL = mock.url;
    resetEnvCache();

    mock.setRoutes([
      {
        // Catalog may be empty in tests → response_format omitted; match prompts.
        includes: "classifying a conversation",
        behavior: { kind: "sse", fixtureRelPath: "sse/chat-classify-coding.sse" },
      },
      {
        includes: "independent conversation judge",
        behavior: { kind: "sse", fixtureRelPath: "sse/judge-stream-happy.sse" },
      },
      {
        includes: '"model":"mock/cand-a"',
        behavior: { kind: "sse", fixtureRelPath: "sse/chat-assistant-reply.sse" },
      },
    ]);

    const sessionId = seedSession();
    const engine = getChatEngine();
    const seen: string[] = [];
    engine.events(sessionId).on("event", (evt: { type: string }) => {
      seen.push(evt.type);
    });

    engine.postUserMessage(sessionId, "Write a typed add helper in TypeScript.");
    engine.sendMessage(sessionId, "test-key");
    await waitFor(
      () =>
        (
          prepare(`SELECT status FROM chat_sessions WHERE id = ?`).get(sessionId) as {
            status: string;
          }
        ).status === "active" &&
        (
          prepare(
            `SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ? AND role = 'assistant' AND length(content) > 0`,
          ).get(sessionId) as { n: number }
        ).n === 1,
      "assistant reply",
    );

    expect(seen).toContain("chat.message.user");
    expect(seen).toContain("chat.message.delta");
    expect(seen).toContain("chat.message.complete");

    engine.judge(sessionId, "test-key");
    await waitFor(
      () =>
        (
          prepare(`SELECT status FROM chat_sessions WHERE id = ?`).get(sessionId) as {
            status: string;
          }
        ).status === "judged",
      "judged",
    );

    expect(seen).toContain("chat.judge.classified");
    expect(seen).toContain("chat.category.decided");
    expect(seen).toContain("chat.judge.complete");
    expect(seen).toContain("chat.scored");

    const snap = getChatSessionSnapshot(sessionId)!;
    expect(snap.session.status).toBe("judged");
    expect(snap.session.category).toBe("coding");
    expect(snap.session.judging_rounds).toBe(1);
    expect(snap.session.median_score).toBeTypeOf("number");
    expect(snap.judgments).toHaveLength(3);
    expect(snap.judgments.every((j) => j.parse_status === "first_try")).toBe(true);

    const persisted = prepare(
      `SELECT type FROM chat_events WHERE session_id = ? ORDER BY id ASC`,
    ).all(sessionId) as Array<{ type: string }>;
    const types = persisted.map((e) => e.type);
    expect(types).toContain("chat.message.user");
    expect(types).toContain("chat.category.decided");
    expect(types).toContain("chat.scored");
    expect(types).not.toContain("chat.message.delta");
    expect(types).not.toContain("chat.judge.delta");
  });

  it("locks category on re-judge and appends a new round", async () => {
    tdb = createTestDb();
    mock = await startMockOpenRouter();
    process.env.OPENROUTER_BASE_URL = mock.url;
    resetEnvCache();
    mock.setRoutes([
      {
        includes: "classifying a conversation",
        behavior: { kind: "sse", fixtureRelPath: "sse/chat-classify-coding.sse" },
      },
      {
        includes: "independent conversation judge",
        behavior: { kind: "sse", fixtureRelPath: "sse/judge-stream-happy.sse" },
      },
    ]);

    const sessionId = seedSession();
    prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, created_at)
       VALUES (?, ?, 'user', 'hi', ?), (?, ?, 'assistant', 'hello', ?)`,
    ).run(randomUUID(), sessionId, Date.now(), randomUUID(), sessionId, Date.now());

    const engine = getChatEngine();
    engine.judge(sessionId, "test-key");
    await waitFor(
      () =>
        (
          prepare(`SELECT judging_rounds FROM chat_sessions WHERE id = ?`).get(
            sessionId,
          ) as { judging_rounds: number }
        ).judging_rounds === 1,
      "round 1",
    );

    const classifyCalls = mock.requests.filter((r) =>
      r.body.includes("classifying a conversation"),
    ).length;
    expect(classifyCalls).toBe(3);

    engine.judge(sessionId, "test-key");
    await waitFor(
      () =>
        (
          prepare(`SELECT judging_rounds FROM chat_sessions WHERE id = ?`).get(
            sessionId,
          ) as { judging_rounds: number }
        ).judging_rounds === 2,
      "round 2",
    );

    const classifyCallsAfter = mock.requests.filter((r) =>
      r.body.includes("classifying a conversation"),
    ).length;
    expect(classifyCallsAfter).toBe(classifyCalls);

    const row = prepare(
      `SELECT category, judging_rounds, status FROM chat_sessions WHERE id = ?`,
    ).get(sessionId) as {
      category: string;
      judging_rounds: number;
      status: string;
    };
    expect(row.category).toBe("coding");
    expect(row.judging_rounds).toBe(2);
    expect(row.status).toBe("judged");

    const rounds = prepare(
      `SELECT DISTINCT round AS r FROM chat_judgments WHERE session_id = ? ORDER BY r`,
    ).all(sessionId) as Array<{ r: number }>;
    expect(rounds.map((x) => x.r)).toEqual([1, 2]);
  });

  it("reopens a judged session so the user can keep chatting", () => {
    tdb = createTestDb();
    const sessionId = seedSession({ status: "judged", category: "coding" });
    prepare(
      `UPDATE chat_sessions SET finished_at = ?, median_score = 7.5 WHERE id = ?`,
    ).run(Date.now(), sessionId);
    prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, created_at)
       VALUES (?, ?, 'user', 'hi', ?), (?, ?, 'assistant', 'hello', ?)`,
    ).run(randomUUID(), sessionId, Date.now(), randomUUID(), sessionId, Date.now());

    const engine = getChatEngine();
    const { messageId } = engine.postUserMessage(sessionId, "follow up");
    expect(messageId).toBeTruthy();

    const row = prepare(
      `SELECT status, finished_at, median_score, category FROM chat_sessions WHERE id = ?`,
    ).get(sessionId) as {
      status: string;
      finished_at: number | null;
      median_score: number | null;
      category: string | null;
    };
    expect(row.status).toBe("active");
    expect(row.finished_at).toBeNull();
    // Prior score kept until the next judging round.
    expect(row.median_score).toBe(7.5);
    expect(row.category).toBe("coding");
  });

  it("keeps prior median when a re-judge panel fully fails", async () => {
    tdb = createTestDb();
    mock = await startMockOpenRouter();
    process.env.OPENROUTER_BASE_URL = mock.url;
    resetEnvCache();
    mock.setRoutes([
      {
        includes: "classifying a conversation",
        behavior: { kind: "sse", fixtureRelPath: "sse/chat-classify-coding.sse" },
      },
      {
        includes: "independent conversation judge",
        behavior: { kind: "sse", fixtureRelPath: "sse/judge-stream-happy.sse" },
      },
    ]);

    const sessionId = seedSession();
    prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, created_at)
       VALUES (?, ?, 'user', 'hi', ?), (?, ?, 'assistant', 'hello', ?)`,
    ).run(randomUUID(), sessionId, Date.now(), randomUUID(), sessionId, Date.now());

    const engine = getChatEngine();
    engine.judge(sessionId, "test-key");
    await waitFor(
      () =>
        (
          prepare(`SELECT status FROM chat_sessions WHERE id = ?`).get(sessionId) as {
            status: string;
          }
        ).status === "judged",
      "first judge",
    );
    const prior = prepare(
      `SELECT median_score, judging_rounds FROM chat_sessions WHERE id = ?`,
    ).get(sessionId) as { median_score: number; judging_rounds: number };
    expect(prior.judging_rounds).toBe(1);
    expect(prior.median_score).toBeTypeOf("number");

    // Break all judge calls on the re-round.
    mock.setRoutes([
      {
        includes: "independent conversation judge",
        behavior: { kind: "http_error", status: 500, body: '{"error":{"message":"down"}}' },
      },
    ]);

    engine.judge(sessionId, "test-key");
    await waitFor(() => {
      const row = prepare(
        `SELECT status, median_score, judging_rounds, error FROM chat_sessions WHERE id = ?`,
      ).get(sessionId) as {
        status: string;
        median_score: number | null;
        judging_rounds: number;
        error: string | null;
      };
      return row.status === "judged" && row.error != null;
    }, "retained after failed re-judge");

    const after = prepare(
      `SELECT status, median_score, judging_rounds, error FROM chat_sessions WHERE id = ?`,
    ).get(sessionId) as {
      status: string;
      median_score: number;
      judging_rounds: number;
      error: string;
    };
    expect(after.status).toBe("judged");
    expect(after.median_score).toBe(prior.median_score);
    expect(after.judging_rounds).toBe(1);
    expect(after.error).toContain("judging_failure");
  });

  it("enforces message guardrails", () => {
    tdb = createTestDb();
    const sessionId = seedSession();
    const engine = getChatEngine();

    expect(() => engine.postUserMessage(sessionId, "   ")).toThrow(ChatStateError);
    expect(() =>
      engine.postUserMessage(sessionId, "x".repeat(8_001)),
    ).toThrow(/too long/i);

    for (let i = 0; i < 10; i++) {
      engine.postUserMessage(sessionId, `turn ${i}`);
    }
    expect(() => engine.postUserMessage(sessionId, "one more")).toThrow(/cap reached/i);
  });
});
