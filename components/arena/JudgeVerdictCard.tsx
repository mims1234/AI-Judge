"use client";

import { cn } from "@/lib/cn";
import { formatLatency, formatScore, formatUsd, scoreBand } from "@/lib/format";
import type { JudgeVerdict } from "@/lib/client/runStore";
import { streamKeyJudge } from "@/lib/client/runStore";
import { useRunStore, useStreamBuffer } from "@/lib/client/useRunStream";
import { FeedbackChipList } from "@/components/ui/FeedbackChip";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { StreamPanel } from "@/components/ui/StreamPanel";
import { VerdictBadge } from "@/components/ui/VerdictBadge";

const SCORE_KEYS = [
  ["correctness", "Correctness"],
  ["requirement_compliance", "Compliance"],
  ["quality", "Quality"],
  ["honesty", "Honesty"],
] as const;

function ScoreBar({ label, value }: { label: string; value: number }) {
  const band = scoreBand(value);
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-dim">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", band.text)}
          style={{ width: `${(value / 10) * 100}%`, backgroundColor: "currentColor" }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs tabular-nums text-body">
        {formatScore(value)}
      </span>
    </div>
  );
}

/** Structured judgment card — never raw JSON (plans/09 §2.4). */
export function JudgeVerdictCard({
  taskResultId,
  judge,
}: {
  taskResultId: string;
  judge: JudgeVerdict;
}) {
  const showStreams = useRunStore((s) => s.showJudgeStreams);
  const buf = useStreamBuffer(streamKeyJudge(taskResultId, judge.judgeModelId));
  const hasVerdict = judge.verdict != null && judge.scores != null;

  return (
    <article className="flex flex-col gap-3 rounded-md border border-line-subtle bg-ink-900 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="truncate font-mono text-xs text-dim">{judge.judgeModelId}</span>
        <div className="flex items-center gap-2">
          {judge.verdict && <VerdictBadge verdict={judge.verdict} size="sm" />}
          <ScoreBadge score={judge.serverOverall ?? null} size="md" />
        </div>
      </header>

      {judge.substituted && (
        <p className="text-xs text-dim">
          reserve judge (self-judging swap)
          {judge.substitutedFor ? ` for ${judge.substitutedFor}` : ""}
        </p>
      )}
      {judge.parseStatus === "repaired" && (
        <p className="text-xs text-dim">
          repaired JSON (attempt {judge.attempt})
        </p>
      )}

      {!hasVerdict ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
          <Skeleton className="h-3 w-3/6" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {SCORE_KEYS.map(([key, label]) => (
              <ScoreBar key={key} label={label} value={judge.scores![key]} />
            ))}
          </div>

          {judge.feedback && (
            <div className="flex flex-col gap-2">
              <FeedbackChipList kind="good" items={judge.feedback.whatWasGood} />
              <FeedbackChipList kind="terrible" items={judge.feedback.whatWasTerrible} />
              <FeedbackChipList kind="missing" items={judge.feedback.whatWasMissing} />
              <FeedbackChipList
                kind="violation"
                items={judge.feedback.constraintViolations}
              />
              <FeedbackChipList kind="critical" items={judge.feedback.criticalErrors} />
              {judge.feedback.oneBestImprovement && (
                <p className="border-l-2 border-teal-400 pl-3 text-sm text-body">
                  {judge.feedback.oneBestImprovement}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {showStreams && (buf.text || buf.status === "streaming") && (
        <StreamPanel
          text={buf.text}
          status={buf.status === "streaming" ? "streaming" : buf.text ? "done" : "idle"}
          label={`Judge stream — ${judge.judgeModelId}`}
          defaultCollapsed
          maxHeight={180}
        />
      )}

      {(judge.costUsd != null || judge.latencyMs != null || claimDiff(judge)) && (
        <footer className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line-subtle pt-2 font-mono text-xs text-dim">
          {claimDiff(judge) && (
            <span className="text-warn-400">
              judge claimed {formatScore(judge.claimedOverall!)}, computed{" "}
              {formatScore(judge.serverOverall!)}
            </span>
          )}
          {judge.costUsd != null && <span>{formatUsd(judge.costUsd)}</span>}
          {judge.latencyMs != null && <span>{formatLatency(judge.latencyMs)}</span>}
        </footer>
      )}
    </article>
  );
}

function claimDiff(j: JudgeVerdict): boolean {
  return (
    j.claimedOverall != null &&
    j.serverOverall != null &&
    Math.abs(j.claimedOverall - j.serverOverall) > 1
  );
}
