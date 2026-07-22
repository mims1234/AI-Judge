"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { PickerModel } from "@/components/models/ModelPicker";
import { ChatComposer } from "@/components/playground/ChatComposer";
import { ChatThread } from "@/components/playground/ChatThread";
import { JudgingPanel } from "@/components/playground/JudgingPanel";
import { PlaygroundSetup } from "@/components/playground/PlaygroundSetup";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  apiFetch,
  isNeedsKeyResponse,
} from "@/lib/client/apiKey";
import { useChatStream } from "@/lib/client/useChatStream";
import { formatUsd } from "@/lib/format";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string; code?: string };
    };
    if (isNeedsKeyResponse(res.status, body)) {
      return "Add your OpenRouter API key in Settings first.";
    }
    return body.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Client orchestrator for /playground — setup → chat → judge. */
export function PlaygroundApp({
  models,
  catalogEmpty,
  initialSessionId = null,
}: {
  models: PickerModel[];
  catalogEmpty: boolean;
  initialSessionId?: string | null;
}) {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [judging, setJudging] = useState(false);

  const { state, reconnect } = useChatStream(sessionId);

  const userTurns = useMemo(
    () => state.messages.filter((m) => m.role === "user").length,
    [state.messages],
  );
  const hasAssistant = state.messages.some(
    (m) => m.role === "assistant" && m.content.length > 0 && !m.streaming,
  );
  const busy =
    state.status === "streaming" || state.status === "judging" || judging;

  const startSession = useCallback(
    async (candidate: string, judgeIds: string[]) => {
      setSetupBusy(true);
      setSetupError(null);
      try {
        const res = await apiFetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate_model_id: candidate,
            judge_pool_model_ids: judgeIds,
          }),
        });
        if (!res.ok) {
          setSetupError(await readError(res));
          return;
        }
        const json = (await res.json()) as { session_id: string };
        setSessionId(json.session_id);
        const url = new URL(window.location.href);
        url.searchParams.set("session", json.session_id);
        window.history.replaceState(null, "", url.toString());
      } catch (err) {
        setSetupError(err instanceof Error ? err.message : "Failed to start");
      } finally {
        setSetupBusy(false);
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId) return;
      setActionError(null);
      const res = await apiFetch(
        `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      if (!res.ok) {
        setActionError(await readError(res));
        throw new Error("send failed");
      }
      reconnect();
    },
    [sessionId, reconnect],
  );

  const judge = useCallback(async () => {
    if (!sessionId) return;
    setActionError(null);
    setJudging(true);
    try {
      const res = await apiFetch(
        `/api/chat/sessions/${encodeURIComponent(sessionId)}/judge`,
        { method: "POST" },
      );
      if (!res.ok) {
        setActionError(await readError(res));
        return;
      }
      reconnect();
    } finally {
      setJudging(false);
    }
  }, [sessionId, reconnect]);

  const reset = () => {
    setSessionId(null);
    setActionError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("session");
    window.history.replaceState(null, "", url.pathname);
  };

  if (!sessionId) {
    return (
      <PlaygroundSetup
        models={models}
        catalogEmpty={catalogEmpty}
        busy={setupBusy}
        error={setupError}
        onStart={startSession}
      />
    );
  }

  const modelLabel = state.candidateModelId ?? "candidate";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg text-bright">Session</h2>
          <Badge tone="neutral">{state.status}</Badge>
          {state.category && <Badge tone="teal">{state.category}</Badge>}
          <Badge tone="neutral">{formatUsd(state.totalCostUsd)}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/playground/leaderboard"
            className="rounded-md px-2.5 py-1.5 text-sm text-dim hover:bg-ink-800 hover:text-bright"
          >
            Leaderboard
          </Link>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            New session
          </Button>
        </div>
      </header>

      <p className="font-mono text-xs text-dim">{modelLabel}</p>

      {(actionError || state.notice) && (
        <p className="rounded-md border border-warn-400/30 bg-warn-900 px-3 py-2 text-sm text-warn-400">
          {actionError || state.notice}
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
        <section className="flex min-h-0 flex-col rounded-md border border-line-subtle bg-ink-950/40 p-3 md:p-4">
          <ChatThread messages={state.messages} candidateModelId={modelLabel} />
          <ChatComposer
            disabled={busy || state.status === "error"}
            judging={judging || state.status === "judging"}
            canJudge={hasAssistant && !busy}
            userTurns={userTurns}
            onSend={sendMessage}
            onJudge={judge}
          />
        </section>
        <JudgingPanel state={state} />
      </div>
    </div>
  );
}
