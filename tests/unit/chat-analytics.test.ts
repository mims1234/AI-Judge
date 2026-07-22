import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { encodeChatSessionError } from "@/lib/chat-errors";
import { prepare } from "@/lib/db";
import {
  getChatSessionSnapshot,
  listRecentChatSessions,
  queryChatLeaderboard,
} from "@/lib/server/chatAnalytics";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("chat analytics (plans/16 §B4)", () => {
  let tdb: TestDb;
  afterEach(() => tdb?.cleanup());

  function seedJudgedSession(opts: {
    modelId: string;
    category: string;
    median: number;
    disagreement?: number;
    finishedAt?: number;
    verdicts?: Array<"pass" | "partial_pass" | "fail">;
  }): string {
    const id = randomUUID();
    const finished = opts.finishedAt ?? Date.now();
    prepare(
      `INSERT INTO chat_sessions (
        id, candidate_model_id, judge_pool_json, status, category,
        median_score, disagreement, judging_rounds, total_cost_usd,
        last_event_id, created_at, finished_at
      ) VALUES (?, ?, ?, 'judged', ?, ?, ?, 1, 0.12, 0, ?, ?)`,
    ).run(
      id,
      opts.modelId,
      JSON.stringify(["mock/judge-1", "mock/judge-2", "mock/judge-3"]),
      opts.category,
      opts.median,
      opts.disagreement ?? 1,
      finished - 1_000,
      finished,
    );

    const verdicts = opts.verdicts ?? ["pass", "pass", "partial_pass"];
    verdicts.forEach((verdict, i) => {
      prepare(
        `INSERT INTO chat_judgments (
          id, session_id, round, judge_model_id, parse_status,
          score_correctness, score_compliance, score_quality, score_honesty,
          claimed_overall, server_overall, verdict, cost_usd, latency_ms, created_at
        ) VALUES (?, ?, 1, ?, 'first_try', 8, 8, 8, 8, 8, 8, ?, 0.01, 100, ?)`,
      ).run(randomUUID(), id, `mock/judge-${i + 1}`, verdict, finished);
    });

    prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, latency_ms, cost_usd, created_at)
       VALUES (?, ?, 'user', 'hello', NULL, NULL, ?)`,
    ).run(randomUUID(), id, finished - 500);
    prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, latency_ms, cost_usd, created_at)
       VALUES (?, ?, 'assistant', 'hi there', 120, 0.02, ?)`,
    ).run(randomUUID(), id, finished - 400);

    return id;
  }

  it("snapshot returns messages + latest-round judgments", () => {
    tdb = createTestDb();
    const id = seedJudgedSession({
      modelId: "mock/cand-a",
      category: "coding",
      median: 8,
    });
    const snap = getChatSessionSnapshot(id);
    expect(snap).not.toBeNull();
    expect(snap!.session.candidate_model_id).toBe("mock/cand-a");
    expect(snap!.session.category).toBe("coding");
    expect(snap!.messages).toHaveLength(2);
    expect(snap!.judgments).toHaveLength(3);
    expect(snap!.judgments.every((j) => j.round === 1)).toBe(true);
  });

  it("lists recent sessions newest-first and filters by model", () => {
    tdb = createTestDb();
    const older = seedJudgedSession({
      modelId: "mock/cand-a",
      category: "coding",
      median: 7,
      finishedAt: 1_000,
    });
    const newer = seedJudgedSession({
      modelId: "mock/cand-b",
      category: "math",
      median: 9,
      finishedAt: 2_000,
    });

    const all = listRecentChatSessions({ limit: 10 });
    expect(all.map((s) => s.id)).toEqual([newer, older]);

    const onlyB = listRecentChatSessions({ modelId: "mock/cand-b" });
    expect(onlyB).toHaveLength(1);
    expect(onlyB[0]!.id).toBe(newer);
    expect(onlyB[0]!.median_score).toBe(9);
  });

  it("leaderboard aggregates medians, provisional flag, and ranks", () => {
    tdb = createTestDb();
    seedJudgedSession({ modelId: "mock/cand-a", category: "coding", median: 9 });
    seedJudgedSession({ modelId: "mock/cand-a", category: "math", median: 7 });
    seedJudgedSession({ modelId: "mock/cand-b", category: "coding", median: 8 });
    // third session for cand-a clears provisional
    seedJudgedSession({ modelId: "mock/cand-a", category: "coding", median: 8 });

    const all = queryChatLeaderboard();
    expect(all.category).toBeNull();
    expect(all.rows[0]!.model_id).toBe("mock/cand-a");
    expect(all.rows[0]!.provisional).toBe(false);
    expect(all.rows[0]!.judged_sessions).toBe(3);
    expect(all.rows[0]!.category_medians.coding).toBe(8.5);
    expect(all.rows[0]!.category_medians.math).toBe(7);

    const codingOnly = queryChatLeaderboard("coding");
    expect(codingOnly.category).toBe("coding");
    const a = codingOnly.rows.find((r) => r.model_id === "mock/cand-a");
    expect(a?.judged_sessions).toBe(2);
    expect(a?.score).toBe(8.5);

    const b = all.rows.find((r) => r.model_id === "mock/cand-b");
    expect(b?.provisional).toBe(true);
    expect(all.rows[0]!.coverage).toBe(1);
    expect(all.rows[0]!.excluded_sessions).toBe(0);
  });

  it("excludes judging_failure sessions from score but tracks coverage", () => {
    tdb = createTestDb();
    seedJudgedSession({ modelId: "mock/cand-a", category: "coding", median: 9 });
    seedJudgedSession({ modelId: "mock/cand-a", category: "coding", median: 7 });

    const failId = randomUUID();
    prepare(
      `INSERT INTO chat_sessions (
        id, candidate_model_id, judge_pool_json, status, category,
        median_score, disagreement, judging_rounds, total_cost_usd,
        error, last_event_id, created_at, finished_at
      ) VALUES (?, ?, ?, 'error', 'coding', NULL, NULL, 0, 0.05, ?, 0, ?, ?)`,
    ).run(
      failId,
      "mock/cand-a",
      JSON.stringify(["mock/judge-1"]),
      encodeChatSessionError(
        "judging_failure",
        "All judges failed to produce a valid score",
      ),
      Date.now() - 500,
      Date.now(),
    );

    const infraId = randomUUID();
    prepare(
      `INSERT INTO chat_sessions (
        id, candidate_model_id, judge_pool_json, status, category,
        median_score, disagreement, judging_rounds, total_cost_usd,
        error, last_event_id, created_at, finished_at
      ) VALUES (?, ?, ?, 'judged', 'coding', 0, NULL, 0, 0.01, ?, 0, ?, ?)`,
    ).run(
      infraId,
      "mock/cand-a",
      JSON.stringify(["mock/judge-1"]),
      encodeChatSessionError("infra_failure", "candidate unavailable"),
      Date.now() - 400,
      Date.now(),
    );

    const coding = queryChatLeaderboard("coding");
    const a = coding.rows.find((r) => r.model_id === "mock/cand-a");
    expect(a).toBeDefined();
    // 9, 7, 0 → median 7
    expect(a!.score).toBe(7);
    expect(a!.judged_sessions).toBe(3);
    expect(a!.penalized_sessions).toBe(1);
    expect(a!.excluded_sessions).toBe(1);
    // scored (non-penalty) = 2; attempts = 3 judged + 1 excluded = 4 → 2/4
    expect(a!.coverage).toBe(0.5);
  });

  it("snapshot returns structured session error", () => {
    tdb = createTestDb();
    const id = randomUUID();
    prepare(
      `INSERT INTO chat_sessions (
        id, candidate_model_id, judge_pool_json, status, category,
        median_score, disagreement, judging_rounds, total_cost_usd,
        error, last_event_id, created_at, finished_at
      ) VALUES (?, ?, ?, 'error', NULL, NULL, NULL, 0, 0, ?, 0, ?, NULL)`,
    ).run(
      id,
      "mock/cand-a",
      JSON.stringify(["mock/judge-1"]),
      encodeChatSessionError("judging_failure", "panel empty"),
      Date.now(),
    );
    const snap = getChatSessionSnapshot(id);
    expect(snap!.session.error).toEqual({
      kind: "judging_failure",
      message: "panel empty",
    });
  });
});
