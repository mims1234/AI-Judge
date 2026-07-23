"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatSseEventSchema,
  type ChatCategory,
  type ChatSessionSnapshot,
  type ChatSessionStatus,
} from "@/lib/schemas";

export type ChatUiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
};

export type ChatUiJudgment = ChatSessionSnapshot["judgments"][number];

export type ChatLiveState = {
  candidateModelId: string | null;
  status: ChatSessionStatus;
  category: ChatCategory | null;
  medianScore: number | null;
  disagreement: number | null;
  judgingRounds: number;
  totalCostUsd: number;
  error: string | null;
  messages: ChatUiMessage[];
  judgments: ChatUiJudgment[];
  classifyVotes: Array<{
    judgeModelId: string;
    category: ChatCategory;
    confidence: number;
    rationale?: string;
  }>;
  connection: "idle" | "hydrating" | "live" | "closed" | "error";
  notice: string | null;
};

function emptyState(): ChatLiveState {
  return {
    candidateModelId: null,
    status: "active",
    category: null,
    medianScore: null,
    disagreement: null,
    judgingRounds: 0,
    totalCostUsd: 0,
    error: null,
    messages: [],
    judgments: [],
    classifyVotes: [],
    connection: "idle",
    notice: null,
  };
}

function fromSnapshot(snap: ChatSessionSnapshot): ChatLiveState {
  return {
    candidateModelId: snap.session.candidate_model_id,
    status: snap.session.status,
    category: snap.session.category,
    medianScore: snap.session.median_score,
    disagreement: snap.session.disagreement,
    judgingRounds: snap.session.judging_rounds,
    totalCostUsd: snap.session.total_cost_usd,
    error: snap.session.error?.message ?? null,
    messages: snap.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    })),
    judgments: snap.judgments,
    classifyVotes: [],
    // Stay "hydrating" until EventSource connects (connect() flips to live).
    connection: "hydrating",
    notice: null,
  };
}

/**
 * Chat playground SSE + snapshot hydration (plans/16 §B3).
 * Mirrors useRunStream's EventSource pattern; key is bound on POST, not SSE.
 */
export function useChatStream(sessionId: string | null) {
  const [state, setState] = useState<ChatLiveState>(emptyState);
  const esRef = useRef<EventSource | null>(null);
  const lastEventIdRef = useRef(0);
  /** Bumps on session change / reconnect so stale hydrate/events are ignored. */
  const genRef = useRef(0);

  const hydrate = useCallback(async (id: string, gen: number) => {
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
    const snap = (await res.json()) as ChatSessionSnapshot;
    if (genRef.current !== gen) return null;
    lastEventIdRef.current = snap.session.last_event_id;
    setState(fromSnapshot(snap));
    return snap;
  }, []);

  const applyEvent = useCallback(
    (
      rawEvent: string,
      rawData: string,
      lastEventId: string | null,
      gen: number,
    ) => {
      if (genRef.current !== gen) return;
      let data: unknown;
      try {
        data = JSON.parse(rawData);
      } catch {
        return;
      }
      const checked = ChatSseEventSchema.safeParse({ event: rawEvent, data });
      if (!checked.success) return;
      const evt = checked.data;
      if (lastEventId && /^\d+$/.test(lastEventId)) {
        lastEventIdRef.current = Number(lastEventId);
      }

      setState((prev) => {
        if (genRef.current !== gen) return prev;
        const next: ChatLiveState = {
          ...prev,
          messages: [...prev.messages],
          judgments: [...prev.judgments],
          classifyVotes: [...prev.classifyVotes],
        };

        switch (evt.event) {
          case "chat.session.status": {
            const prevStatus = prev.status;
            next.status = evt.data.status;
            next.totalCostUsd = evt.data.totalCostUsd;
            // Stop EventSource auto-reconnect spam when the session is idle.
            // Do NOT close on a bare `active` after judged/error — that is the
            // continue-after-judge re-open (or a replay of it). Closing there
            // kills the stream before assistant deltas arrive.
            const idleAfterWork =
              evt.data.status === "judged" ||
              evt.data.status === "error" ||
              (evt.data.status === "active" &&
                (prevStatus === "streaming" || prevStatus === "judging"));
            if (idleAfterWork) {
              queueMicrotask(() => {
                if (genRef.current !== gen) return;
                esRef.current?.close();
                esRef.current = null;
                setState((s) =>
                  s.connection === "live"
                    ? { ...s, connection: "closed" }
                    : s,
                );
              });
            }
            break;
          }
          case "chat.message.user":
            if (!next.messages.some((m) => m.id === evt.data.messageId)) {
              next.messages.push({
                id: evt.data.messageId,
                role: "user",
                content: evt.data.content,
              });
            }
            break;
          case "chat.message.delta": {
            const idx = next.messages.findIndex(
              (m) => m.id === evt.data.messageId,
            );
            if (idx >= 0) {
              const cur = next.messages[idx]!;
              next.messages[idx] = {
                ...cur,
                content: cur.content + evt.data.delta,
                streaming: true,
              };
            } else {
              next.messages.push({
                id: evt.data.messageId,
                role: "assistant",
                content: evt.data.delta,
                streaming: true,
              });
            }
            next.status = "streaming";
            break;
          }
          case "chat.message.complete": {
            const idx = next.messages.findIndex(
              (m) => m.id === evt.data.messageId,
            );
            if (idx >= 0) {
              next.messages[idx] = {
                ...next.messages[idx]!,
                streaming: false,
              };
            }
            break;
          }
          case "chat.judge.classified":
            next.classifyVotes = [
              ...next.classifyVotes.filter(
                (v) => v.judgeModelId !== evt.data.judgeModelId,
              ),
              {
                judgeModelId: evt.data.judgeModelId,
                category: evt.data.category,
                confidence: evt.data.confidence,
                rationale: evt.data.rationale,
              },
            ];
            break;
          case "chat.category.decided":
            next.category = evt.data.category;
            break;
          case "chat.judge.complete": {
            const judgment: ChatUiJudgment = {
              judge_model_id: evt.data.judgeModelId,
              round: evt.data.round,
              predicted_category: null,
              category_confidence: null,
              category_rationale: null,
              parse_status: evt.data.parseStatus,
              scores: evt.data.scores ?? null,
              claimed_overall: evt.data.claimedOverall ?? null,
              server_overall: evt.data.serverOverall ?? null,
              verdict: evt.data.verdict ?? null,
              feedback: evt.data.feedback
                ? {
                    what_was_good: evt.data.feedback.whatWasGood,
                    what_was_terrible: evt.data.feedback.whatWasTerrible,
                    what_was_missing: evt.data.feedback.whatWasMissing,
                    constraint_violations:
                      evt.data.feedback.constraintViolations,
                    critical_errors: evt.data.feedback.criticalErrors,
                    specific_evidence: evt.data.feedback.specificEvidence,
                    one_best_improvement:
                      evt.data.feedback.oneBestImprovement,
                  }
                : null,
              cost_usd: evt.data.costUsd,
              latency_ms: evt.data.latencyMs,
            };
            next.judgments = [
              ...next.judgments.filter(
                (j) => j.judge_model_id !== judgment.judge_model_id,
              ),
              judgment,
            ].sort((a, b) =>
              a.judge_model_id.localeCompare(b.judge_model_id),
            );
            break;
          }
          case "chat.scored":
            next.medianScore = evt.data.median;
            next.disagreement = evt.data.disagreement;
            next.judgingRounds = evt.data.round;
            next.category = evt.data.category;
            next.status = "judged";
            break;
          case "chat.cost":
            next.totalCostUsd = evt.data.totalCostUsd;
            break;
          case "chat.error":
            next.notice = evt.data.message;
            if (evt.data.scope === "session") {
              next.error = evt.data.message;
              next.status = "error";
            }
            break;
          default:
            break;
        }
        return next;
      });
    },
    [],
  );

  const connect = useCallback(
    (id: string, gen: number) => {
      esRef.current?.close();
      const qs =
        lastEventIdRef.current > 0
          ? `?lastEventId=${lastEventIdRef.current}`
          : "";
      const es = new EventSource(
        `/api/chat/sessions/${encodeURIComponent(id)}/events${qs}`,
      );
      esRef.current = es;
      if (genRef.current === gen) {
        setState((s) => ({ ...s, connection: "live", notice: null }));
      }

      const names = [
        "chat.session.status",
        "chat.message.user",
        "chat.message.delta",
        "chat.message.complete",
        "chat.judge.started",
        "chat.judge.delta",
        "chat.judge.classified",
        "chat.category.decided",
        "chat.judge.complete",
        "chat.scored",
        "chat.cost",
        "chat.error",
        "heartbeat",
      ] as const;

      for (const name of names) {
        es.addEventListener(name, (ev) => {
          const msg = ev as MessageEvent<string>;
          applyEvent(name, msg.data, msg.lastEventId || null, gen);
        });
      }
      es.onerror = () => {
        if (genRef.current !== gen) return;
        setState((s) => ({
          ...s,
          connection:
            es.readyState === EventSource.CLOSED ? "closed" : "error",
        }));
      };
    },
    [applyEvent],
  );

  useEffect(() => {
    if (!sessionId) {
      genRef.current += 1;
      setState(emptyState());
      return;
    }
    const gen = ++genRef.current;
    setState((s) => ({
      ...emptyState(),
      connection: "hydrating",
      notice: s.notice,
    }));
    void (async () => {
      try {
        await hydrate(sessionId, gen);
        if (genRef.current === gen) connect(sessionId, gen);
      } catch (err) {
        if (genRef.current === gen) {
          setState((s) => ({
            ...s,
            connection: "error",
            notice:
              err instanceof Error ? err.message : "Failed to load session",
          }));
        }
      }
    })();
    return () => {
      genRef.current += 1;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [sessionId, hydrate, connect]);

  const reconnect = useCallback(() => {
    if (!sessionId) return;
    const gen = ++genRef.current;
    connect(sessionId, gen);
  }, [sessionId, connect]);

  const hydrateSession = useCallback(
    async (id: string) => hydrate(id, genRef.current),
    [hydrate],
  );

  return { state, reconnect, hydrate: hydrateSession };
}
