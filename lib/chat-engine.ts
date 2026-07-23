import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  encodeChatSessionError,
  type ChatSessionErrorKind,
} from "@/lib/chat-errors";
import { getDb, prepare } from "@/lib/db";
import { CHAT_CLASSIFY_PROMPT, chatRubricFor } from "@/lib/bundles/chat-rubrics";
import { withJudgeEnglishOnly } from "@/lib/bundles/judge-language";
import { OpenRouterError, streamChat, type StreamChatResult } from "@/lib/openrouter";
import {
  computedOverall,
  median,
  panelConfidenceAdjusted,
} from "@/lib/scoring";
import {
  CHAT_CATEGORY_ORDER,
  CHAT_LIMITS,
  ChatClassificationSchema,
  EPHEMERAL_CHAT_SSE_EVENTS,
  JudgeOutputSchema,
  chatClassificationJsonSchema,
  judgeOutputJsonSchema,
  type ChatCategory,
  type ChatSessionStatus,
  type JudgeOutput,
} from "@/lib/schemas";

export {
  encodeChatSessionError,
  parseChatSessionError,
  type ChatSessionErrorKind,
} from "@/lib/chat-errors";

/**
 * Chat playground engine (plans/16 §B2) — mirrors lib/run-engine.ts patterns:
 * globalThis singleton, per-session EventEmitter on a single "event" channel,
 * persisted-vs-ephemeral event split, BYOK keys held in memory only.
 *
 * Judging flow per round: every judge classifies the transcript (structured
 * output) → consensus decides the category (majority → confidence → general)
 * → the same judges score with the category rubric (existing JudgeOutput
 * contract) → median/disagreement aggregation, then panel-confidence
 * shrinkage (same math as scoring.ts finalizeRun).
 */

export class ChatStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatStateError";
  }
}

/** Cross-bundle safe check (Next may load duplicate module copies). */
export function isChatStateError(err: unknown): err is ChatStateError {
  return (
    err instanceof ChatStateError ||
    (err instanceof Error && err.name === "ChatStateError")
  );
}

/** Drop the candidate from the judge panel (backup if overlap reached storage). */
export function effectiveChatJudgePool(
  candidateModelId: string,
  judgePool: string[],
): string[] {
  return judgePool.filter((id) => id !== candidateModelId);
}

type EngineEvent = { id?: number; type: string; payload: unknown };

export interface ChatEngine {
  /** Bind/replace the in-memory OpenRouter key for a session (never persisted). */
  bindApiKey(sessionId: string, apiKey?: string | null): void;
  /** Persist a user message and broadcast it (throws ChatStateError on guardrails). */
  postUserMessage(sessionId: string, content: string): { messageId: string };
  /** Stream the candidate's reply to the latest user message (async). */
  sendMessage(sessionId: string, apiKey?: string | null): void;
  /** Run a judging round (async). Re-judging appends a new round. */
  judge(sessionId: string, apiKey?: string | null): void;
  events(sessionId: string): EventEmitter;
}

type SessionRow = {
  id: string;
  candidate_model_id: string;
  judge_pool_json: string;
  status: ChatSessionStatus;
  category: ChatCategory | null;
  median_score: number | null;
  judging_rounds: number;
  total_cost_usd: number;
};

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  finish_reason?: string | null;
};

const PLATFORM_TRUNCATION_NOTE =
  "[PLATFORM NOTE: The response above was cut off by the platform output-token limit, not by the model. Do NOT penalize it for being incomplete or ending mid-sentence.]";

type JudgeVote = { judgeModelId: string; category: ChatCategory; confidence: number };

/**
 * Category consensus (plans/16 §B2.2): plurality vote; ties broken by the
 * highest confidence among the tied categories, then category order; empty
 * panel falls back to "general".
 */
export function decideCategory(votes: JudgeVote[]): ChatCategory {
  if (votes.length === 0) return "general";

  const counts = new Map<ChatCategory, number>();
  for (const v of votes) counts.set(v.category, (counts.get(v.category) ?? 0) + 1);
  const topCount = Math.max(...counts.values());
  const tied = [...counts.entries()]
    .filter(([, n]) => n === topCount)
    .map(([c]) => c);
  if (tied.length === 1) return tied[0]!;

  const tiedVotes = votes
    .filter((v) => tied.includes(v.category))
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return (
        CHAT_CATEGORY_ORDER.indexOf(a.category) -
        CHAT_CATEGORY_ORDER.indexOf(b.category)
      );
    });
  return tiedVotes[0]?.category ?? "general";
}

/** Render the transcript for judge prompts, capped head+tail at the char cap. */
export function renderTranscript(messages: MessageRow[]): string {
  const full = messages
    .map((m) => {
      const role = m.role === "user" ? "USER" : "ASSISTANT";
      const body = `${role}:\n${m.content}`;
      if (m.role === "assistant" && m.finish_reason === "length") {
        return `${body}\n${PLATFORM_TRUNCATION_NOTE}`;
      }
      return body;
    })
    .join("\n\n");
  const cap = CHAT_LIMITS.MAX_TRANSCRIPT_CHARS;
  if (full.length <= cap) return full;
  const head = full.slice(0, 2_000);
  const tail = full.slice(-(cap - 2_000 - 40));
  return `${head}\n\n[… middle of transcript elided …]\n\n${tail}`;
}

type ParsedCall<T> = {
  parsed: T | null;
  parseStatus: "first_try" | "repaired" | "invalid";
  rawText: string;
  costUsd: number;
  latencyMs: number;
};

function parseJsonLoose<T>(
  text: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { toString(): string } } },
): { parsed: T | null; errors: string | null } {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch (err) {
    return { parsed: null, errors: `JSON parse error: ${String(err)}` };
  }
  const checked = schema.safeParse(raw);
  if (!checked.success || checked.data === undefined) {
    return { parsed: null, errors: checked.error?.toString() ?? "schema mismatch" };
  }
  return { parsed: checked.data, errors: null };
}

class ChatEngineImpl implements ChatEngine {
  private emitters = new Map<string, EventEmitter>();
  private sessionKeys = new Map<string, string>();
  private inFlight = new Set<string>();
  private recovered = false;

  constructor(opts?: { skipRecover?: boolean }) {
    if (!opts?.skipRecover) this.recover();
  }

  /** Preserve in-memory keys/emitters when replacing a stale HMR singleton. */
  adoptLiveState(prev: {
    emitters: Map<string, EventEmitter>;
    sessionKeys: Map<string, string>;
    inFlight: Set<string>;
  }): void {
    this.emitters = prev.emitters;
    this.sessionKeys = prev.sessionKeys;
    this.inFlight = prev.inFlight;
    this.recovered = true;
  }

  /** Crash recovery: sessions die mid-stream/mid-judging with the process. */
  private recover(): void {
    if (this.recovered) return;
    this.recovered = true;
    try {
      getDb().transaction(() => {
        prepare(
          `UPDATE chat_sessions SET status = 'active' WHERE status = 'streaming'`,
        ).run();
        prepare(
          `UPDATE chat_sessions
           SET status = CASE WHEN judging_rounds > 0 THEN 'judged' ELSE 'active' END
           WHERE status = 'judging'`,
        ).run();
        // Drop assistant placeholders left by a dead stream.
        prepare(`DELETE FROM chat_messages WHERE role = 'assistant' AND content = ''`).run();
      })();
    } catch (err) {
      console.error("[chat-engine] recovery failed", err);
    }
  }

  events(sessionId: string): EventEmitter {
    let ee = this.emitters.get(sessionId);
    if (!ee) {
      ee = new EventEmitter();
      ee.setMaxListeners(50);
      this.emitters.set(sessionId, ee);
    }
    return ee;
  }

  private emitEvent(sessionId: string, type: string, payload: unknown): EngineEvent {
    const ephemeral = EPHEMERAL_CHAT_SSE_EVENTS.has(type);
    let id: number | undefined;
    if (!ephemeral) {
      const info = prepare(
        `INSERT INTO chat_events (session_id, type, payload, created_at)
         VALUES (@session_id, @type, @payload, @created_at)`,
      ).run({
        session_id: sessionId,
        type,
        payload: JSON.stringify(payload),
        created_at: Date.now(),
      });
      id = Number(info.lastInsertRowid);
      prepare(`UPDATE chat_sessions SET last_event_id = ? WHERE id = ?`).run(
        id,
        sessionId,
      );
    }
    const evt: EngineEvent = { id, type, payload };
    this.events(sessionId).emit("event", evt);
    return evt;
  }

  bindApiKey(sessionId: string, apiKey?: string | null): void {
    if (apiKey) this.sessionKeys.set(sessionId, apiKey);
  }

  private resolveKey(sessionId: string, explicit?: string | null): string | null {
    return explicit ?? this.sessionKeys.get(sessionId) ?? null;
  }

  private getSession(sessionId: string): SessionRow {
    const row = prepare(`SELECT * FROM chat_sessions WHERE id = ?`).get(sessionId) as
      | SessionRow
      | undefined;
    if (!row) throw new ChatStateError(`No chat session ${sessionId}`);
    return row;
  }

  private setStatus(sessionId: string, status: ChatSessionStatus): void {
    prepare(`UPDATE chat_sessions SET status = ? WHERE id = ?`).run(status, sessionId);
    const s = this.getSession(sessionId);
    this.emitEvent(sessionId, "chat.session.status", {
      sessionId,
      status,
      totalCostUsd: s.total_cost_usd,
    });
  }

  private addCost(sessionId: string, usd: number): void {
    if (!(usd > 0)) return;
    prepare(
      `UPDATE chat_sessions SET total_cost_usd = total_cost_usd + ? WHERE id = ?`,
    ).run(usd, sessionId);
    const s = this.getSession(sessionId);
    this.emitEvent(sessionId, "chat.cost", {
      sessionId,
      totalCostUsd: s.total_cost_usd,
    });
  }

  private getTranscript(sessionId: string): MessageRow[] {
    return prepare(
      `SELECT id, role, content, finish_reason FROM chat_messages
       WHERE session_id = ? ORDER BY created_at ASC, rowid ASC`,
    ).all(sessionId) as MessageRow[];
  }

  /* ---------------- Candidate reply ---------------- */

  postUserMessage(sessionId: string, content: string): { messageId: string } {
    const session = this.getSession(sessionId);
    // Allow continue-after-judge (and recover from error); block mid-stream/judging.
    if (
      session.status !== "active" &&
      session.status !== "judged" &&
      session.status !== "error"
    ) {
      throw new ChatStateError(`Cannot message while session is ${session.status}`);
    }
    const trimmed = content.trim();
    if (!trimmed) throw new ChatStateError("Message must not be empty");
    if (trimmed.length > CHAT_LIMITS.MAX_MESSAGE_CHARS) {
      throw new ChatStateError(
        `Message too long — cap is ${CHAT_LIMITS.MAX_MESSAGE_CHARS} chars`,
      );
    }
    const userTurns = prepare(
      `SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ? AND role = 'user'`,
    ).get(sessionId) as { n: number };
    if (userTurns.n >= CHAT_LIMITS.MAX_USER_TURNS) {
      throw new ChatStateError("Message cap reached — end and judge this chat");
    }

    // Re-open after a judging round so multi-turn + re-judge works.
    if (session.status === "judged" || session.status === "error") {
      prepare(
        `UPDATE chat_sessions
         SET status = 'active', finished_at = NULL, error = NULL
         WHERE id = ?`,
      ).run(sessionId);
      this.emitEvent(sessionId, "chat.session.status", {
        sessionId,
        status: "active" as const,
        totalCostUsd: session.total_cost_usd,
      });
    }

    const messageId = randomUUID();
    prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, created_at)
       VALUES (?, ?, 'user', ?, ?)`,
    ).run(messageId, sessionId, trimmed, Date.now());
    this.emitEvent(sessionId, "chat.message.user", {
      sessionId,
      messageId,
      content: trimmed,
    });
    return { messageId };
  }

  sendMessage(sessionId: string, apiKey?: string | null): void {
    this.bindApiKey(sessionId, apiKey);
    if (this.inFlight.has(sessionId)) {
      throw new ChatStateError("Session busy — wait for the current operation");
    }
    const session = this.getSession(sessionId);
    if (session.status !== "active") {
      throw new ChatStateError(`Cannot message while session is ${session.status}`);
    }
    const userTurns = prepare(
      `SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ? AND role = 'user'`,
    ).get(sessionId) as { n: number };
    if (userTurns.n === 0) {
      throw new ChatStateError("Post a user message first");
    }

    this.inFlight.add(sessionId);
    void this.doSendMessage(sessionId).finally(() => {
      this.inFlight.delete(sessionId);
    });
  }

  private async doSendMessage(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    const key = this.resolveKey(sessionId);
    const abort = new AbortController();
    const assistantId = randomUUID();

    this.setStatus(sessionId, "streaming");
    prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, created_at)
       VALUES (?, ?, 'assistant', '', ?)`,
    ).run(assistantId, sessionId, Date.now());

    const history = this.getTranscript(sessionId)
      .filter((m) => m.id !== assistantId)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Coalesce deltas to ~15/sec (same 66ms window as the run engine).
    let pendingDelta = "";
    let lastFlush = 0;
    const flush = () => {
      if (!pendingDelta) return;
      const delta = pendingDelta;
      pendingDelta = "";
      lastFlush = Date.now();
      this.emitEvent(sessionId, "chat.message.delta", { sessionId, messageId: assistantId, delta });
    };
    const onDelta = (d: string) => {
      pendingDelta += d;
      if (Date.now() - lastFlush >= 66) flush();
    };

    try {
      const result = await streamChat({
        model: session.candidate_model_id,
        messages: history,
        temperature: 0.7,
        maxTokens: CHAT_LIMITS.ASSISTANT_MAX_TOKENS,
        signal: abort.signal,
        deadlineMs: 300_000,
        apiKey: key,
        onDelta,
        onRetry: (attempt, delayMs, reason) => {
          this.emitEvent(sessionId, "chat.error", {
            sessionId,
            scope: "message",
            code: "RETRY_SCHEDULED",
            message: `Retry ${attempt} in ${Math.round(delayMs / 1000)}s (${reason})`,
          });
        },
      });
      flush();

      getDb().transaction(() => {
        prepare(
          `UPDATE chat_messages
           SET content = ?, prompt_tokens = ?, completion_tokens = ?,
               cost_usd = ?, latency_ms = ?, finish_reason = ?
           WHERE id = ?`,
        ).run(
          result.text,
          result.usage.prompt_tokens,
          result.usage.completion_tokens,
          result.usage.cost_usd,
          result.latency_ms,
          result.finish_reason,
          assistantId,
        );
        prepare(
          `UPDATE chat_sessions SET total_cost_usd = total_cost_usd + ? WHERE id = ?`,
        ).run(result.usage.cost_usd, sessionId);
      })();

      this.emitEvent(sessionId, "chat.message.complete", {
        sessionId,
        messageId: assistantId,
        finishReason: result.finish_reason,
        tokens: {
          prompt: result.usage.prompt_tokens,
          completion: result.usage.completion_tokens,
        },
        costUsd: result.usage.cost_usd,
        latencyMs: result.latency_ms,
      });
      const s = this.getSession(sessionId);
      this.emitEvent(sessionId, "chat.cost", { sessionId, totalCostUsd: s.total_cost_usd });
      this.setStatus(sessionId, "active");
    } catch (err) {
      // Clean up the placeholder so the transcript stays well-formed.
      prepare(`DELETE FROM chat_messages WHERE id = ?`).run(assistantId);
      this.setStatus(sessionId, "active");
      const message =
        err instanceof OpenRouterError ? err.message : "Unexpected streaming error";
      this.emitEvent(sessionId, "chat.error", {
        sessionId,
        scope: "message",
        code: err instanceof OpenRouterError ? err.kind.toUpperCase() : "INTERNAL_ERROR",
        message,
      });
    }
  }

  /* ---------------- Judging ---------------- */

  judge(sessionId: string, apiKey?: string | null): void {
    this.bindApiKey(sessionId, apiKey);
    if (this.inFlight.has(sessionId)) {
      throw new ChatStateError("Session busy — wait for the current operation");
    }
    const session = this.getSession(sessionId);
    if (session.status !== "active" && session.status !== "judged" && session.status !== "error") {
      throw new ChatStateError(`Cannot judge while session is ${session.status}`);
    }
    const assistantTurns = prepare(
      `SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ? AND role = 'assistant'`,
    ).get(sessionId) as { n: number };
    if (assistantTurns.n === 0) {
      throw new ChatStateError("Nothing to judge yet — send at least one message");
    }

    this.inFlight.add(sessionId);
    void this.doJudge(sessionId).finally(() => {
      this.inFlight.delete(sessionId);
    });
  }

  private async doJudge(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    const storedPool = JSON.parse(session.judge_pool_json) as string[];
    // Backup: never let the candidate score itself even if DB was seeded oddly.
    const judgePool = effectiveChatJudgePool(
      session.candidate_model_id,
      storedPool,
    );
    if (judgePool.length < CHAT_LIMITS.MIN_JUDGES) {
      this.failJudging(
        sessionId,
        "judging_failure",
        "Judge pool too small after removing self-judging overlap",
        "JUDGING_FAILED",
      );
      return;
    }
    const key = this.resolveKey(sessionId);
    const round = session.judging_rounds + 1;
    const transcript = renderTranscript(this.getTranscript(sessionId));

    this.setStatus(sessionId, "judging");

    try {
      // Phase 1 — classification (skipped when the category locked in an earlier round).
      let decided = session.category;
      const classificationByJudge = new Map<
        string,
        { category: ChatCategory; confidence: number; rationale: string }
      >();
      if (!decided) {
        const classifications = await Promise.allSettled(
          judgePool.map((judgeModelId) =>
            this.classifyWithJudge(sessionId, judgeModelId, transcript, key),
          ),
        );

        const votes: JudgeVote[] = [];
        classifications.forEach((outcome, i) => {
          const judgeModelId = judgePool[i]!;
          if (outcome.status === "fulfilled" && outcome.value.parsed) {
            const { category, confidence, rationale } = outcome.value.parsed;
            votes.push({ judgeModelId, category, confidence });
            classificationByJudge.set(judgeModelId, { category, confidence, rationale });
            this.emitEvent(sessionId, "chat.judge.classified", {
              sessionId,
              judgeModelId,
              category,
              confidence,
              rationale,
            });
          } else {
            this.emitEvent(sessionId, "chat.error", {
              sessionId,
              scope: "judging",
              code: "CLASSIFY_FAILED",
              message: `${judgeModelId} could not classify the transcript`,
            });
          }
        });

        decided = decideCategory(votes);
        prepare(`UPDATE chat_sessions SET category = ? WHERE id = ? AND category IS NULL`).run(
          decided,
          sessionId,
        );
        this.emitEvent(sessionId, "chat.category.decided", {
          sessionId,
          category: decided,
          votes,
          locked: false,
        });
      } else {
        this.emitEvent(sessionId, "chat.category.decided", {
          sessionId,
          category: decided,
          votes: [],
          locked: true,
        });
      }

      // Phase 2 — category rubric scoring by the same panel.
      const scored = await Promise.allSettled(
        judgePool.map((judgeModelId) =>
          this.scoreWithJudge(
            sessionId,
            judgeModelId,
            decided!,
            transcript,
            round,
            key,
            classificationByJudge.get(judgeModelId) ?? null,
          ),
        ),
      );

      const judgeOveralls: number[] = [];
      scored.forEach((outcome, i) => {
        const judgeModelId = judgePool[i]!;
        if (outcome.status === "fulfilled") {
          const r = outcome.value;
          if (r.parseStatus !== "invalid" && r.parsed) {
            judgeOveralls.push(computedOverall(r.parsed.scores));
          }
        } else {
          this.emitEvent(sessionId, "chat.error", {
            sessionId,
            scope: "judging",
            code: "JUDGE_FAILED",
            message: `${judgeModelId} failed: ${String(outcome.reason)}`,
          });
        }
      });

      if (judgeOveralls.length === 0) {
        this.failJudging(
          sessionId,
          "judging_failure",
          "All judges failed to produce a valid score",
          "JUDGING_FAILED",
        );
        return;
      }

      const rawMedian = median(judgeOveralls);
      const disagreement =
        Math.max(...judgeOveralls) - Math.min(...judgeOveralls);
      const flagged = disagreement > 3;
      // Same confidence rule as bundle runs: fewer valid judges → shrink
      // toward 5. Expected panel = pool size (playground allows 3–5).
      const med = panelConfidenceAdjusted(
        rawMedian,
        judgeOveralls.length,
        judgePool.length,
      );

      getDb().transaction(() => {
        prepare(
          `UPDATE chat_sessions
           SET status = 'judged', median_score = ?, disagreement = ?,
               judging_rounds = ?, finished_at = ?, error = NULL
           WHERE id = ?`,
        ).run(med, disagreement, round, Date.now(), sessionId);
      })();

      this.emitEvent(sessionId, "chat.scored", {
        sessionId,
        category: decided,
        round,
        median: med,
        disagreement,
        flagged,
        judgeOveralls,
        rawMedian,
        validJudges: judgeOveralls.length,
        expectedJudges: judgePool.length,
      });
      this.setStatus(sessionId, "judged");
    } catch (err) {
      this.failJudging(
        sessionId,
        "judging_failure",
        err instanceof Error ? err.message : String(err),
        "JUDGING_FAILED",
      );
    }
  }

  /**
   * Bundle-aligned failure handling:
   * - judging_failure with a prior median → keep status `judged` (don't erase paid work)
   * - judging_failure with no prior score → `error` (excluded from leaderboard score)
   * - infra_failure → `error` with median_score forced to 0 when we want a penalty
   *   (chat has no candidate-task infra path today; reserved for symmetry)
   */
  private failJudging(
    sessionId: string,
    kind: ChatSessionErrorKind,
    message: string,
    code: string,
  ): void {
    const prior = this.getSession(sessionId);
    const encoded = encodeChatSessionError(kind, message);
    const retainPrior =
      kind === "judging_failure" &&
      prior.median_score != null &&
      prior.judging_rounds > 0;

    if (retainPrior) {
      prepare(`UPDATE chat_sessions SET error = ? WHERE id = ?`).run(
        encoded,
        sessionId,
      );
      this.emitEvent(sessionId, "chat.error", {
        sessionId,
        scope: "judging",
        code,
        message: `${message} (prior score kept)`,
        kind,
        retainedScore: true,
      });
      this.setStatus(sessionId, "judged");
      return;
    }

    if (kind === "infra_failure") {
      // Candidate-side fault → score 0 so the attempt still appears on the board.
      prepare(
        `UPDATE chat_sessions
         SET status = 'judged', median_score = 0, disagreement = NULL,
             finished_at = COALESCE(finished_at, ?), error = ?
         WHERE id = ?`,
      ).run(Date.now(), encoded, sessionId);
      this.emitEvent(sessionId, "chat.error", {
        sessionId,
        scope: "judging",
        code,
        message,
        kind,
        retainedScore: false,
      });
      this.setStatus(sessionId, "judged");
      return;
    }

    prepare(
      `UPDATE chat_sessions SET status = 'error', error = ? WHERE id = ?`,
    ).run(encoded, sessionId);
    this.emitEvent(sessionId, "chat.error", {
      sessionId,
      scope: "judging",
      code,
      message,
      kind,
      retainedScore: false,
    });
    this.setStatus(sessionId, "error");
  }

  /** One structured-output call with a single schema-repair retry. */
  private async structuredCall<T>(opts: {
    sessionId: string;
    judgeModelId: string;
    phase: "classify" | "score";
    system: string;
    user: string;
    schemaName: string;
    jsonSchema: object;
    parse: (text: string) => { parsed: T | null; errors: string | null };
    maxTokens: number;
    deadlineMs: number;
    apiKey: string | null;
  }): Promise<ParsedCall<T> & { result: StreamChatResult | null }> {
    const { sessionId, judgeModelId, phase } = opts;
    let costUsd = 0;
    let latencyMs = 0;
    let rawText = "";
    let lastResult: StreamChatResult | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const repairNote =
        attempt === 2
          ? `\n\nYour previous reply was not valid JSON matching the schema. Reply with ONLY the JSON object.`
          : "";
      const result = await streamChat({
        model: judgeModelId,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user + repairNote },
        ],
        temperature: 0,
        maxTokens: opts.maxTokens,
        responseFormat: { name: opts.schemaName, schema: opts.jsonSchema },
        signal: AbortSignal.timeout(opts.deadlineMs),
        deadlineMs: opts.deadlineMs,
        allowRetryAfterPartial: true,
        apiKey: opts.apiKey,
        onDelta: (d) =>
          this.emitEvent(sessionId, "chat.judge.delta", {
            sessionId,
            judgeModelId,
            phase,
            delta: d,
          }),
      });
      lastResult = result;
      costUsd += result.usage.cost_usd;
      latencyMs += result.latency_ms;
      rawText = result.text;

      const { parsed } = opts.parse(result.text);
      if (parsed) {
        return {
          parsed,
          parseStatus: attempt === 1 ? "first_try" : "repaired",
          rawText,
          costUsd,
          latencyMs,
          result: lastResult,
        };
      }
    }

    return {
      parsed: null,
      parseStatus: "invalid",
      rawText,
      costUsd,
      latencyMs,
      result: lastResult,
    };
  }

  private async classifyWithJudge(
    sessionId: string,
    judgeModelId: string,
    transcript: string,
    apiKey: string | null,
  ) {
    this.emitEvent(sessionId, "chat.judge.started", {
      sessionId,
      judgeModelId,
      round: this.getSession(sessionId).judging_rounds + 1,
      phase: "classify",
    });
    const call = await this.structuredCall({
      sessionId,
      judgeModelId,
      phase: "classify",
      system: withJudgeEnglishOnly(CHAT_CLASSIFY_PROMPT),
      user: `CONVERSATION TRANSCRIPT:\n${transcript}`,
      schemaName: "chat_classification",
      jsonSchema: chatClassificationJsonSchema,
      parse: (text) => parseJsonLoose(text, ChatClassificationSchema),
      maxTokens: CHAT_LIMITS.CLASSIFY_MAX_TOKENS,
      deadlineMs: 120_000,
      apiKey,
    });
    this.addCost(sessionId, call.costUsd);
    return call;
  }

  private async scoreWithJudge(
    sessionId: string,
    judgeModelId: string,
    category: ChatCategory,
    transcript: string,
    round: number,
    apiKey: string | null,
    classification: { category: ChatCategory; confidence: number; rationale: string } | null,
  ) {
    this.emitEvent(sessionId, "chat.judge.started", {
      sessionId,
      judgeModelId,
      round,
      phase: "score",
    });
    const call = await this.structuredCall<JudgeOutput>({
      sessionId,
      judgeModelId,
      phase: "score",
      system: withJudgeEnglishOnly(chatRubricFor(category)),
      user: `CONVERSATION TRANSCRIPT:\n${transcript}`,
      schemaName: "judge_output",
      jsonSchema: judgeOutputJsonSchema,
      parse: (text) => parseJsonLoose(text, JudgeOutputSchema),
      maxTokens: CHAT_LIMITS.JUDGE_MAX_TOKENS,
      deadlineMs: 240_000,
      apiKey,
    });

    const parsed = call.parsed;
    const server = parsed ? computedOverall(parsed.scores) : null;

    prepare(
      `INSERT INTO chat_judgments (
        id, session_id, round, judge_model_id, predicted_category,
        category_confidence, category_rationale,
        raw_output, parsed_json, parse_status,
        score_correctness, score_compliance, score_quality, score_honesty,
        claimed_overall, server_overall, verdict,
        prompt_tokens, completion_tokens, cost_usd, latency_ms, created_at
      ) VALUES (
        @id, @session_id, @round, @judge_model_id, @predicted_category,
        @category_confidence, @category_rationale,
        @raw_output, @parsed_json, @parse_status,
        @score_correctness, @score_compliance, @score_quality, @score_honesty,
        @claimed_overall, @server_overall, @verdict,
        @prompt_tokens, @completion_tokens, @cost_usd, @latency_ms, @created_at
      )
      ON CONFLICT (session_id, round, judge_model_id) DO UPDATE SET
        raw_output = excluded.raw_output,
        parsed_json = excluded.parsed_json,
        parse_status = excluded.parse_status,
        score_correctness = excluded.score_correctness,
        score_compliance = excluded.score_compliance,
        score_quality = excluded.score_quality,
        score_honesty = excluded.score_honesty,
        claimed_overall = excluded.claimed_overall,
        server_overall = excluded.server_overall,
        verdict = excluded.verdict,
        prompt_tokens = excluded.prompt_tokens,
        completion_tokens = excluded.completion_tokens,
        cost_usd = excluded.cost_usd,
        latency_ms = excluded.latency_ms`,
    ).run({
      id: randomUUID(),
      session_id: sessionId,
      round,
      judge_model_id: judgeModelId,
      predicted_category: classification?.category ?? null,
      category_confidence: classification?.confidence ?? null,
      category_rationale: classification?.rationale ?? null,
      raw_output: call.rawText,
      parsed_json: parsed ? JSON.stringify(parsed) : null,
      parse_status: call.parseStatus,
      score_correctness: parsed?.scores.correctness ?? null,
      score_compliance: parsed?.scores.requirement_compliance ?? null,
      score_quality: parsed?.scores.quality ?? null,
      score_honesty: parsed?.scores.honesty ?? null,
      claimed_overall: parsed?.overall_score ?? null,
      server_overall: server,
      verdict: parsed?.verdict ?? null,
      prompt_tokens: call.result?.usage.prompt_tokens ?? null,
      completion_tokens: call.result?.usage.completion_tokens ?? null,
      cost_usd: call.costUsd,
      latency_ms: call.latencyMs,
      created_at: Date.now(),
    });

    this.addCost(sessionId, call.costUsd);

    this.emitEvent(sessionId, "chat.judge.complete", {
      sessionId,
      judgeModelId,
      round,
      parseStatus: call.parseStatus,
      ...(parsed
        ? {
            verdict: parsed.verdict,
            scores: parsed.scores,
            claimedOverall: parsed.overall_score,
            serverOverall: server,
            feedback: {
              whatWasGood: parsed.what_was_good,
              whatWasTerrible: parsed.what_was_terrible,
              whatWasMissing: parsed.what_was_missing,
              constraintViolations: parsed.constraint_violations,
              criticalErrors: parsed.critical_errors,
              specificEvidence: parsed.specific_evidence,
              oneBestImprovement: parsed.one_best_improvement,
            },
          }
        : {}),
      costUsd: call.costUsd,
      latencyMs: call.latencyMs,
    });

    return call;
  }
}

type GlobalEngine = { __aiJudgeChatEngine?: ChatEngineImpl };

/**
 * globalThis singleton. On Next.js HMR the class identity changes, so an
 * `instanceof` miss means we must rebuild — otherwise old method bodies
 * (e.g. "cannot message while judged") keep running forever.
 */
export function getChatEngine(): ChatEngine {
  const g = globalThis as typeof globalThis & GlobalEngine;
  const existing = g.__aiJudgeChatEngine;
  if (existing instanceof ChatEngineImpl) {
    return existing;
  }

  const next = new ChatEngineImpl({ skipRecover: !!existing });
  if (existing) {
    const stale = existing as unknown as {
      emitters?: Map<string, EventEmitter>;
      sessionKeys?: Map<string, string>;
      inFlight?: Set<string>;
    };
    if (stale.emitters && stale.sessionKeys && stale.inFlight) {
      next.adoptLiveState({
        emitters: stale.emitters,
        sessionKeys: stale.sessionKeys,
        inFlight: stale.inFlight,
      });
    }
  }
  g.__aiJudgeChatEngine = next;
  return next;
}

/** Test hook: drop the singleton between suites. */
export function resetChatEngineForTests(): void {
  const g = globalThis as typeof globalThis & GlobalEngine;
  g.__aiJudgeChatEngine = undefined;
}
