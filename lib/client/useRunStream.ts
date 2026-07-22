"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { SseEventSchema, type RunSnapshot, type SseEvent } from "@/lib/schemas";
import { useAnnounce } from "@/components/ui/StatusAnnouncer";
import { apiFetch } from "@/lib/client/apiKey";
import {
  applySseEvent,
  cloneStoreShallow,
  hydrateFromSnapshot,
  isTerminal,
  streamKeyCandidate,
  streamKeyJudge,
  type ConnectionState,
  type RunStoreState,
  type StreamKey,
} from "@/lib/client/runStore";

/**
 * EventSource lifecycle + token buffers (plans/09 §3.3–§3.4).
 * Grid subscribes to coarse store; only the open StreamPanel subscribes to buffers.
 */

const SHOW_JUDGE_STREAMS_KEY = "ai-judge:show-judge-streams";
const WATCHDOG_MS = 45_000;
const FLUSH_MS = 80;
const TOKEN_TICK_MS = 500;

type StreamBuffer = {
  text: string;
  tokens: number;
  status: "idle" | "streaming" | "done" | "error";
};

/** Stable empty snapshot for useSyncExternalStore — never mutate this object. */
const EMPTY_BUFFER: StreamBuffer = Object.freeze({
  text: "",
  tokens: 0,
  status: "idle" as const,
});

type StoreApi = {
  getState: () => RunStoreState;
  subscribe: (listener: () => void) => () => void;
  getBuffer: (key: StreamKey) => StreamBuffer;
  subscribeBuffer: (key: StreamKey, listener: () => void) => () => void;
  setShowJudgeStreams: (on: boolean) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
  retryTask: (taskResultId: string) => Promise<void>;
  controlPending: "pause" | "resume" | "cancel" | "retry" | null;
};

const RunStoreContext = createContext<StoreApi | null>(null);

function backoffMs(attempt: number): number {
  const base = Math.min(15_000, 1000 * 2 ** Math.min(attempt, 4));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

async function fetchSnapshot(runId: string): Promise<RunSnapshot> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
  return (await res.json()) as RunSnapshot;
}

export function RunStoreProvider({
  runId,
  initialSnapshot,
  children,
}: {
  runId: string;
  initialSnapshot: RunSnapshot;
  children: ReactNode;
}) {
  const announce = useAnnounce();
  const announceRef = useRef(announce);
  announceRef.current = announce;

  const stateRef = useRef<RunStoreState>(hydrateFromSnapshot(initialSnapshot));
  const listenersRef = useRef(new Set<() => void>());
  const buffersRef = useRef(new Map<StreamKey, StreamBuffer>());
  const bufferListenersRef = useRef(new Map<StreamKey, Set<() => void>>());
  const dirtyBuffersRef = useRef(new Set<StreamKey>());
  const lastMsgAtRef = useRef(Date.now());
  const esRef = useRef<EventSource | null>(null);
  const closedDeliberatelyRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const [controlPending, setControlPending] = useState<
    "pause" | "resume" | "cancel" | "retry" | null
  >(null);

  // Restore judge-stream preference
  useEffect(() => {
    try {
      const v = localStorage.getItem(SHOW_JUDGE_STREAMS_KEY);
      if (v === "1") stateRef.current.showJudgeStreams = true;
    } catch {
      // ignore
    }
  }, []);

  const emit = useCallback(() => {
    stateRef.current = cloneStoreShallow(stateRef.current);
    for (const l of listenersRef.current) l();
  }, []);

  const emitBuffer = useCallback((key: StreamKey) => {
    const set = bufferListenersRef.current.get(key);
    if (!set) return;
    for (const l of set) l();
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current != null) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      const keys = [...dirtyBuffersRef.current];
      dirtyBuffersRef.current.clear();
      for (const key of keys) emitBuffer(key);
    }, FLUSH_MS);
  }, [emitBuffer]);

  const appendBuffer = useCallback(
    (key: StreamKey, delta: string, tokens?: number) => {
      const prev = buffersRef.current.get(key);
      if (tokens != null && prev && tokens <= prev.tokens) return; // duplicate-drop
      // New object each update so useSyncExternalStore getSnapshot changes by reference.
      const next: StreamBuffer = {
        text: (prev?.text ?? "") + delta,
        tokens: tokens ?? prev?.tokens ?? 0,
        status: "streaming",
      };
      buffersRef.current.set(key, next);
      dirtyBuffersRef.current.add(key);
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const setBufferDone = useCallback(
    (key: StreamKey, text?: string) => {
      const prev = buffersRef.current.get(key);
      const next: StreamBuffer = {
        text: text ?? prev?.text ?? "",
        tokens: prev?.tokens ?? 0,
        status: "done",
      };
      buffersRef.current.set(key, next);
      dirtyBuffersRef.current.add(key);
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const seedBuffersFromSnapshot = useCallback(
    (snap: RunSnapshot) => {
      for (const tr of snap.task_results) {
        const key = streamKeyCandidate(tr.id);
        if (tr.raw_output) {
          buffersRef.current.set(key, {
            text: tr.raw_output,
            tokens: tr.tokens?.completion ?? 0,
            status: tr.status === "streaming" ? "streaming" : "done",
          });
        }
      }
    },
    [],
  );

  // Initial buffer seed
  useEffect(() => {
    seedBuffersFromSnapshot(initialSnapshot);
  }, [initialSnapshot, seedBuffersFromSnapshot]);

  const rehydrate = useCallback(async () => {
    try {
      const snap = await fetchSnapshot(runId);
      stateRef.current = hydrateFromSnapshot(snap);
      // Preserve connection bookkeeping
      if (!isTerminal(snap.run.status)) {
        stateRef.current.connection = "live";
      }
      seedBuffersFromSnapshot(snap);
      emit();
      return snap;
    } catch (err) {
      console.error("[useRunStream] rehydrate failed", err);
      throw err;
    }
  }, [emit, runId, seedBuffersFromSnapshot]);

  const setConnection = useCallback(
    (c: ConnectionState, reconnectInMs: number | null = null) => {
      if (stateRef.current.connection === c && stateRef.current.reconnectInMs === reconnectInMs) {
        return;
      }
      stateRef.current.connection = c;
      stateRef.current.reconnectInMs = reconnectInMs;
      emit();
    },
    [emit],
  );

  const handleEvent = useCallback(
    (rawEvent: string, rawData: string, lastEventId: string | null) => {
      lastMsgAtRef.current = Date.now();
      let parsed: unknown;
      try {
        parsed = { event: rawEvent, data: JSON.parse(rawData) };
      } catch {
        return;
      }
      const checked = SseEventSchema.safeParse(parsed);
      if (!checked.success) return; // ignore unknown / malformed

      const event = checked.data as SseEvent;
      const eventId =
        lastEventId && /^\d+$/.test(lastEventId) ? Number(lastEventId) : null;

      // Token appends before store apply
      if (event.event === "candidate.delta") {
        appendBuffer(
          streamKeyCandidate(event.data.taskResultId),
          event.data.delta,
          event.data.tokens,
        );
      } else if (event.event === "judge.delta") {
        appendBuffer(
          streamKeyJudge(event.data.taskResultId, event.data.judgeModelId),
          event.data.delta,
        );
      } else if (event.event === "candidate.complete") {
        setBufferDone(streamKeyCandidate(event.data.taskResultId));
      }

      const result = applySseEvent(stateRef.current, event, eventId);

      if (result.needsResync || result.unknownCell) {
        void rehydrate();
      }

      if (result.notice) {
        announceRef.current(result.notice.message);
      }

      if (result.terminal) {
        closedDeliberatelyRef.current = true;
        esRef.current?.close();
        esRef.current = null;
        setConnection("closed");
      }

      emit();
    },
    [appendBuffer, emit, rehydrate, setBufferDone, setConnection],
  );

  const openEventSource = useCallback(
    (lastEventId: number | null) => {
      if (closedDeliberatelyRef.current) return;
      esRef.current?.close();

      const qs =
        lastEventId != null && lastEventId > 0
          ? `?lastEventId=${lastEventId}`
          : "";
      const url = `/api/runs/${encodeURIComponent(runId)}/events${qs}`;
      const es = new EventSource(url);
      esRef.current = es;

      const NAMES = [
        "run.status",
        "task.status",
        "candidate.delta",
        "candidate.complete",
        "validation.complete",
        "judge.started",
        "judge.delta",
        "judge.complete",
        "task.scored",
        "run.cost",
        "notice",
        "run.complete",
        "resync",
        "heartbeat",
      ] as const;

      for (const name of NAMES) {
        es.addEventListener(name, (ev) => {
          const msg = ev as MessageEvent<string>;
          handleEvent(name, msg.data, msg.lastEventId || null);
          if (stateRef.current.connection !== "live" && !isTerminal(stateRef.current.run.status)) {
            if (reconnectAttemptRef.current > 0) {
              announceRef.current("Reconnected");
            }
            reconnectAttemptRef.current = 0;
            setConnection("live");
          }
        });
      }

      es.onerror = () => {
        if (closedDeliberatelyRef.current || isTerminal(stateRef.current.run.status)) {
          es.close();
          return;
        }
        es.close();
        esRef.current = null;
        const attempt = reconnectAttemptRef.current++;
        const delay = backoffMs(attempt);
        setConnection(attempt === 0 ? "reconnecting" : "disconnected", delay);
        if (attempt === 0) announceRef.current("Connection lost — retrying");
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = window.setTimeout(() => {
          void (async () => {
            try {
              await rehydrate();
            } catch {
              // open anyway with last known id
            }
            openEventSource(stateRef.current.lastEventId);
          })();
        }, delay);
      };
    },
    [handleEvent, rehydrate, runId, setConnection],
  );

  // Watchdog + initial subscribe
  useEffect(() => {
    if (isTerminal(initialSnapshot.run.status)) {
      stateRef.current.connection = "closed";
      emit();
      return;
    }

    closedDeliberatelyRef.current = false;
    openEventSource(stateRef.current.lastEventId);

    watchdogRef.current = window.setInterval(() => {
      if (closedDeliberatelyRef.current || isTerminal(stateRef.current.run.status)) return;
      if (Date.now() - lastMsgAtRef.current < WATCHDOG_MS) return;
      announceRef.current("Connection lost — retrying");
      setConnection("reconnecting", 1000);
      esRef.current?.close();
      esRef.current = null;
      const delay = backoffMs(reconnectAttemptRef.current++);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(() => {
        void rehydrate().finally(() => openEventSource(stateRef.current.lastEventId));
      }, delay);
    }, 5_000);

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      if (hiddenFor > 30_000 && !isTerminal(stateRef.current.run.status)) {
        void rehydrate().finally(() => {
          esRef.current?.close();
          openEventSource(stateRef.current.lastEventId);
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      closedDeliberatelyRef.current = true;
      esRef.current?.close();
      esRef.current = null;
      if (watchdogRef.current) window.clearInterval(watchdogRef.current);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
    // intentionally once per runId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const postControl = useCallback(
    async (action: "pause" | "resume" | "cancel") => {
      setControlPending(action);
      try {
        const res = await apiFetch(
          `/api/runs/${encodeURIComponent(runId)}/${action}`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        announceRef.current(
          action === "cancel"
            ? "Could not cancel — retry"
            : `Could not ${action} — retry`,
        );
        console.error(`[useRunStream] ${action}`, err);
      } finally {
        setControlPending(null);
      }
    },
    [runId],
  );

  const api: StoreApi = {
    getState: () => stateRef.current,
    subscribe: (listener) => {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    },
    getBuffer: (key) => buffersRef.current.get(key) ?? EMPTY_BUFFER,
    subscribeBuffer: (key, listener) => {
      let set = bufferListenersRef.current.get(key);
      if (!set) {
        set = new Set();
        bufferListenersRef.current.set(key, set);
      }
      set.add(listener);
      return () => {
        set!.delete(listener);
      };
    },
    setShowJudgeStreams: (on) => {
      stateRef.current.showJudgeStreams = on;
      try {
        localStorage.setItem(SHOW_JUDGE_STREAMS_KEY, on ? "1" : "0");
      } catch {
        // ignore
      }
      emit();
    },
    pause: () => postControl("pause"),
    resume: () => postControl("resume"),
    cancel: () => postControl("cancel"),
    retryTask: async (taskResultId: string) => {
      setControlPending("retry");
      const loc = stateRef.current.byTaskResultId.get(taskResultId);
      if (loc) {
        const trial = stateRef.current.cells.get(loc.cellKey)?.trials.get(loc.trialIndex);
        if (trial) {
          trial.status = "pending";
          trial.error = undefined;
          emit();
        }
      }
      try {
        const res = await apiFetch(
          `/api/runs/${encodeURIComponent(runId)}/tasks/${encodeURIComponent(taskResultId)}/retry`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        announceRef.current("Retry failed — try again");
        console.error("[useRunStream] retry", err);
        void rehydrate();
      } finally {
        setControlPending(null);
      }
    },
    controlPending,
  };

  // Expose controlPending via state re-render of provider children that read context
  const apiRef = useRef(api);
  apiRef.current = api;

  const stableApi = useRef<StoreApi>({
    getState: () => apiRef.current.getState(),
    subscribe: (l) => apiRef.current.subscribe(l),
    getBuffer: (k) => apiRef.current.getBuffer(k),
    subscribeBuffer: (k, l) => apiRef.current.subscribeBuffer(k, l),
    setShowJudgeStreams: (on) => apiRef.current.setShowJudgeStreams(on),
    pause: () => apiRef.current.pause(),
    resume: () => apiRef.current.resume(),
    cancel: () => apiRef.current.cancel(),
    retryTask: (id) => apiRef.current.retryTask(id),
    get controlPending() {
      return apiRef.current.controlPending;
    },
  }).current;

  // Keep controlPending getter fresh by wrapping provider value with state
  const value: StoreApi = {
    ...stableApi,
    controlPending,
  };

  return createElement(RunStoreContext.Provider, { value }, children);
}

export function useRunStoreApi(): StoreApi {
  const ctx = useContext(RunStoreContext);
  if (!ctx) throw new Error("useRunStoreApi must be used within RunStoreProvider");
  return ctx;
}

export function useRunStore<T>(selector: (s: RunStoreState) => T): T {
  const api = useRunStoreApi();
  return useSyncExternalStore(
    api.subscribe,
    () => selector(api.getState()),
    () => selector(api.getState()),
  );
}

export function useStreamBuffer(key: StreamKey | null): StreamBuffer {
  const api = useRunStoreApi();
  return useSyncExternalStore(
    (onStoreChange) => {
      if (!key) return () => {};
      return api.subscribeBuffer(key, onStoreChange);
    },
    () => (key ? api.getBuffer(key) : EMPTY_BUFFER),
    () => (key ? api.getBuffer(key) : EMPTY_BUFFER),
  );
}

/** Throttled token counter for grid cells (500ms). */
export function useCellTokenTick(taskResultId: string | null): number {
  const api = useRunStoreApi();
  const [tokens, setTokens] = useState(0);

  useEffect(() => {
    if (!taskResultId) return;
    const key = streamKeyCandidate(taskResultId);
    let last = 0;
    const tick = () => {
      const buf = api.getBuffer(key);
      if (buf.tokens !== last) {
        last = buf.tokens;
        setTokens(buf.tokens);
      }
    };
    tick();
    const id = window.setInterval(tick, TOKEN_TICK_MS);
    const unsub = api.subscribeBuffer(key, tick);
    return () => {
      window.clearInterval(id);
      unsub();
    };
  }, [api, taskResultId]);

  return tokens;
}
