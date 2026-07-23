import { describe, expect, it } from "vitest";
import {
  encodeChatSessionError,
  parseChatSessionError,
} from "@/lib/chat-errors";
import {
  decideCategory,
  effectiveChatJudgePool,
  renderTranscript,
} from "@/lib/chat-engine";
import { CHAT_LIMITS, CreateChatSessionRequestSchema } from "@/lib/schemas";

describe("decideCategory (plans/16 §B2.2)", () => {
  it("returns general for an empty panel", () => {
    expect(decideCategory([])).toBe("general");
  });

  it("uses plurality vote", () => {
    expect(
      decideCategory([
        { judgeModelId: "j1", category: "coding", confidence: 0.5 },
        { judgeModelId: "j2", category: "coding", confidence: 0.4 },
        { judgeModelId: "j3", category: "math", confidence: 0.99 },
      ]),
    ).toBe("coding");
  });

  it("breaks ties by highest confidence among tied categories", () => {
    expect(
      decideCategory([
        { judgeModelId: "j1", category: "coding", confidence: 0.6 },
        { judgeModelId: "j2", category: "math", confidence: 0.9 },
        { judgeModelId: "j3", category: "story", confidence: 0.1 },
      ]),
    ).toBe("math");
  });

  it("breaks equal-confidence ties by CHAT_CATEGORY_ORDER", () => {
    expect(
      decideCategory([
        { judgeModelId: "j1", category: "math", confidence: 0.8 },
        { judgeModelId: "j2", category: "coding", confidence: 0.8 },
      ]),
    ).toBe("coding");
  });

  it("can select general when it wins the vote", () => {
    expect(
      decideCategory([
        { judgeModelId: "j1", category: "general", confidence: 0.7 },
        { judgeModelId: "j2", category: "general", confidence: 0.6 },
        { judgeModelId: "j3", category: "research", confidence: 0.95 },
      ]),
    ).toBe("general");
  });
});

describe("chat session error encoding", () => {
  it("round-trips structured errors", () => {
    const raw = encodeChatSessionError("judging_failure", "All judges failed");
    expect(parseChatSessionError(raw)).toEqual({
      kind: "judging_failure",
      message: "All judges failed",
    });
  });

  it("treats legacy plain strings as judging_failure", () => {
    expect(parseChatSessionError("boom")).toEqual({
      kind: "judging_failure",
      message: "boom",
    });
  });
});

describe("renderTranscript (plans/16 §B2)", () => {
  it("formats roles and joins turns", () => {
    expect(
      renderTranscript([
        { id: "1", role: "user", content: "hi" },
        { id: "2", role: "assistant", content: "hello" },
      ]),
    ).toBe("USER:\nhi\n\nASSISTANT:\nhello");
  });

  it("elides the middle when over the char cap", () => {
    const big = "x".repeat(CHAT_LIMITS.MAX_TRANSCRIPT_CHARS + 5_000);
    const out = renderTranscript([{ id: "1", role: "user", content: big }]);
    expect(out.length).toBeLessThanOrEqual(CHAT_LIMITS.MAX_TRANSCRIPT_CHARS + 80);
    expect(out).toContain("[… middle of transcript elided …]");
    expect(out.startsWith("USER:\nxxx")).toBe(true);
    expect(out.endsWith("xxx")).toBe(true);
  });

  it("appends PLATFORM NOTE only when finish_reason is length", () => {
    const truncated = renderTranscript([
      { id: "1", role: "user", content: "list 10" },
      {
        id: "2",
        role: "assistant",
        content: "1. a\n2. b",
        finish_reason: "length",
      },
    ]);
    expect(truncated).toContain("ASSISTANT:\n1. a\n2. b");
    expect(truncated).toContain(
      "[PLATFORM NOTE: The response above was cut off by the platform output-token limit",
    );

    const normal = renderTranscript([
      { id: "1", role: "user", content: "hi" },
      {
        id: "2",
        role: "assistant",
        content: "hello",
        finish_reason: "stop",
      },
    ]);
    expect(normal).toBe("USER:\nhi\n\nASSISTANT:\nhello");
    expect(normal).not.toContain("PLATFORM NOTE");
  });
});

describe("self-judging guards", () => {
  it("effectiveChatJudgePool drops the candidate", () => {
    expect(
      effectiveChatJudgePool("cand", ["j1", "cand", "j2", "j3"]),
    ).toEqual(["j1", "j2", "j3"]);
  });

  it("CreateChatSessionRequestSchema rejects candidate in judge pool", () => {
    const bad = CreateChatSessionRequestSchema.safeParse({
      candidate_model_id: "mock/cand-a",
      judge_pool_model_ids: ["mock/cand-a", "mock/judge-2", "mock/judge-3"],
    });
    expect(bad.success).toBe(false);

    const good = CreateChatSessionRequestSchema.safeParse({
      candidate_model_id: "mock/cand-a",
      judge_pool_model_ids: ["mock/judge-1", "mock/judge-2", "mock/judge-3"],
    });
    expect(good.success).toBe(true);
  });
});
