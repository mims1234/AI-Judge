"use client";

import { useEffect, useState } from "react";
import { formatDuration, formatUsd, shortId } from "@/lib/format";
import { isTerminal } from "@/lib/client/runStore";
import { useRunStore, useRunStoreApi } from "@/lib/client/useRunStream";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ProgressRail } from "@/components/ui/ProgressRail";
import { StatusDot, type StatusDotTone } from "@/components/ui/StatusDot";

const STATUS_TONE: Record<
  string,
  { tone: "neutral" | "teal" | "warn" | "fail" | "pass"; label: string }
> = {
  queued: { tone: "neutral", label: "QUEUED" },
  running: { tone: "teal", label: "RUNNING" },
  paused: { tone: "warn", label: "PAUSED" },
  cancelled: { tone: "neutral", label: "CANCELLED" },
  completed: { tone: "pass", label: "COMPLETED" },
  incomplete: { tone: "fail", label: "INCOMPLETE" },
};

function connectionTone(
  c: "live" | "reconnecting" | "disconnected" | "closed",
): { tone: StatusDotTone; label: string } {
  if (c === "live") return { tone: "done", label: "live" };
  if (c === "reconnecting") return { tone: "streaming", label: "reconnecting…" };
  if (c === "disconnected") return { tone: "error", label: "disconnected" };
  return { tone: "idle", label: "closed" };
}

/** Live/replay run header (plans/09 §2.2). */
export function RunHeader() {
  const api = useRunStoreApi();
  const run = useRunStore((s) => s.run);
  const connection = useRunStore((s) => s.connection);
  const reconnectInMs = useRunStore((s) => s.reconnectInMs);
  const showJudgeStreams = useRunStore((s) => s.showJudgeStreams);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Avoid SSR/client Date.now() mismatch on the live elapsed clock.
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);

  const terminal = isTerminal(run.status);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (!mounted || terminal || !run.startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [mounted, terminal, run.startedAt]);

  const startedMs = run.startedAt ? Date.parse(run.startedAt) : null;
  const finishedMs = run.finishedAt ? Date.parse(run.finishedAt) : null;
  const elapsed =
    startedMs == null
      ? 0
      : terminal && finishedMs != null
        ? finishedMs - startedMs
        : mounted
          ? now - startedMs
          : 0;

  const capReached = run.notice?.code === "BUDGET_CAP_REACHED";
  const statusMeta = STATUS_TONE[run.status] ?? STATUS_TONE.queued!;
  const statusLabel =
    run.status === "incomplete" && capReached
      ? "INCOMPLETE — CAP REACHED"
      : statusMeta.label;

  const { scored, error, total, flagged } = run.progress;
  const done = scored + error;
  const spendWarn =
    run.spend.cap != null && run.spend.actual >= run.spend.cap * 0.8;

  const conn = connectionTone(connection);
  const connLabel =
    connection === "disconnected" && reconnectInMs != null
      ? `disconnected — retrying in ${Math.ceil(reconnectInMs / 1000)}s`
      : conn.label;

  return (
    <header className="flex flex-col gap-3 border-b border-line-subtle pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-sm text-bright">
              RUN #{shortId(run.id, 4)}
            </h1>
            <span className="font-mono text-xs text-dim">{run.bundleId}</span>
            <Badge tone={statusMeta.tone}>{statusLabel}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="mr-2 flex items-center gap-2 text-xs text-dim">
            <input
              type="checkbox"
              checked={showJudgeStreams}
              onChange={(e) => api.setShowJudgeStreams(e.target.checked)}
              className="accent-teal-400"
            />
            Show judge streams
          </label>

          {!terminal && run.status !== "paused" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void api.pause()}
              loading={api.controlPending === "pause"}
            >
              Pause
            </Button>
          )}
          {!terminal && run.status === "paused" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void api.resume()}
              loading={api.controlPending === "resume"}
            >
              Resume
            </Button>
          )}
          {!terminal && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setCancelOpen(true)}
              loading={api.controlPending === "cancel"}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <ProgressRail
          value={done}
          max={Math.max(total, 1)}
          label={`${done} of ${total} tasks`}
          segments={[
            { value: scored, tone: "teal" },
            { value: error, tone: "fail" },
            { value: flagged, tone: "warn" },
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-dim">
          <span>
            {done}/{total} tasks · {formatDuration(elapsed)} elapsed
          </span>
          <span className={spendWarn ? "text-warn-400" : undefined}>
            Spend {formatUsd(run.spend.actual)}
            {run.spend.estimated != null && ` of ~${formatUsd(run.spend.estimated)} est`}
            {run.spend.cap != null && ` (${formatUsd(run.spend.cap)} cap)`}
          </span>
          {!terminal && (
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={conn.tone} />
              reconnect: {connLabel}
            </span>
          )}
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel run?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep running
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setCancelOpen(false);
                void api.cancel();
              }}
            >
              Cancel run
            </Button>
          </div>
        }
      >
        <p className="text-sm text-body">
          Cancel run? Completed cells keep their scores; the run is marked
          cancelled and won&apos;t enter the leaderboard.
        </p>
      </Modal>
    </header>
  );
}
