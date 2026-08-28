"use client";

import { CostBreakdown } from "@/components/report/CostBreakdown";
import { FinalScoreMatrix } from "@/components/report/FinalScoreMatrix";
import { RunMetadata } from "@/components/report/RunMetadata";
import { StatCard } from "@/components/ui/StatCard";
import {
  formatDuration,
  formatScore,
  formatUsd,
} from "@/lib/format";
import type { Category, RunSnapshot } from "@/lib/schemas";

export type RunReportProps = {
  snapshot: RunSnapshot;
  eligibilityReason?: string | null;
  onOpenCell?: (candidate: string, category: Category, taskId?: string) => void;
};

function countTasks(snapshot: RunSnapshot) {
  let scored = 0;
  let errored = 0;
  let penalized = 0;
  let excluded = 0;
  for (const tr of snapshot.task_results) {
    if (tr.status === "scored") scored += 1;
    else if (tr.status === "error") {
      errored += 1;
      if (tr.error?.kind === "judging_failure") excluded += 1;
      else penalized += 1;
    }
  }
  return { scored, errored, total: snapshot.task_results.length, penalized, excluded };
}

/** Report tab root — scores, cost, metadata, exports (plans/10 §5). */
export function RunReport({
  snapshot,
  eligibilityReason,
  onOpenCell,
}: RunReportProps) {
  const { scored, errored, penalized, excluded } = countTasks(snapshot);
  const cancelled = snapshot.run.status === "cancelled";
  const hasScore = snapshot.bundle_run_score != null;
  const eligible = !cancelled && (snapshot.run.status === "completed" || hasScore);
  const started = snapshot.run.started_at
    ? Date.parse(snapshot.run.started_at)
    : null;
  const finished = snapshot.run.finished_at
    ? Date.parse(snapshot.run.finished_at)
    : null;
  const duration =
    started != null && finished != null ? finished - started : null;

  const exportBase = `/api/runs/${snapshot.run.id}/export`;

  const leaderboardSub = cancelled
    ? eligibilityReason ?? "Cancelled"
    : errored > 0
      ? [
          penalized > 0 ? `${penalized} penalized (score 0)` : null,
          excluded > 0 ? `${excluded} excluded (judge fault)` : null,
        ]
          .filter(Boolean)
          .join(" · ") || eligibilityReason || "Partial coverage"
      : snapshot.run.status === "completed"
        ? "Complete run"
        : eligibilityReason ?? `Status: ${snapshot.run.status}`;

  return (
    <div className="flex flex-col gap-8" data-testid="run-report">
      {snapshot.instrument_wipeout && (
        <div
          role="alert"
          data-testid="wipeout-banner"
          className="flex items-start gap-3 rounded-md border border-fail-400/40 bg-fail-900 px-4 py-3"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-fail-400"
          >
            <path
              d="M8 1.5 15 14H1L8 1.5Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="8" cy="11.8" r="0.9" fill="currentColor" />
          </svg>
          <div>
            <p className="text-sm font-medium text-fail-400">
              Instrument wipeout
            </p>
            <p className="mt-0.5 text-sm leading-6 text-body">
              Every candidate failed the pinned{" "}
              <span className="font-mono">{`{ "answer" }`}</span> schema on
              attempted tasks. Infra and judging failures without a schema check
              are ignored.
            </p>
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Total score"
          value={formatScore(snapshot.bundle_run_score)}
          tone="accent"
        />
        <StatCard
          label="Total cost"
          value={formatUsd(snapshot.run.total_cost_usd)}
        />
        <StatCard
          label="Duration"
          value={formatDuration(duration)}
        />
        <StatCard
          label="Tasks"
          value={`${scored}/${scored + errored}`}
          sub={
            errored > 0
              ? `${penalized} penalized · ${excluded} excluded`
              : "all scored"
          }
        />
        <StatCard
          label="Leaderboard"
          value={
            cancelled
              ? "✕ Not eligible"
              : errored > 0
                ? "✓ With penalties"
                : eligible
                  ? "✓ Counted"
                  : "✕ Not eligible"
          }
          tone={cancelled ? "warn" : eligible ? "accent" : "warn"}
          sub={leaderboardSub}
        />
      </div>

      <FinalScoreMatrix snapshot={snapshot} onOpenCell={onOpenCell} />
      <CostBreakdown snapshot={snapshot} />
      <RunMetadata snapshot={snapshot} />

      <div className="flex flex-wrap gap-2">
        <a
          href={`${exportBase}?format=json`}
          download
          data-testid="export-run-json"
          className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-body transition-colors duration-150 hover:border-teal-400 hover:text-bright"
        >
          Export JSON
        </a>
        <a
          href={`${exportBase}?format=csv`}
          download
          data-testid="export-run-csv"
          className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-body transition-colors duration-150 hover:border-teal-400 hover:text-bright"
        >
          Export CSV
        </a>
      </div>
    </div>
  );
}
