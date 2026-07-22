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
  onOpenCell?: (candidate: string, category: Category) => void;
};

function countTasks(snapshot: RunSnapshot) {
  let scored = 0;
  let errored = 0;
  for (const tr of snapshot.task_results) {
    if (tr.status === "scored") scored += 1;
    else if (tr.status === "error") errored += 1;
  }
  return { scored, errored, total: snapshot.task_results.length };
}

/** Report tab root — scores, cost, metadata, exports (plans/10 §5). */
export function RunReport({
  snapshot,
  eligibilityReason,
  onOpenCell,
}: RunReportProps) {
  const { scored, errored } = countTasks(snapshot);
  const eligible = snapshot.run.status === "completed";
  const started = snapshot.run.started_at
    ? Date.parse(snapshot.run.started_at)
    : null;
  const finished = snapshot.run.finished_at
    ? Date.parse(snapshot.run.finished_at)
    : null;
  const duration =
    started != null && finished != null ? finished - started : null;

  const exportBase = `/api/runs/${snapshot.run.id}/export`;

  return (
    <div className="flex flex-col gap-8" data-testid="run-report">
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
          sub={errored > 0 ? `${errored} errored` : "all scored"}
        />
        <StatCard
          label="Leaderboard"
          value={eligible ? "✓ Counted" : "✕ Not eligible"}
          tone={eligible ? "accent" : "warn"}
          sub={
            eligible
              ? "Complete run"
              : eligibilityReason ?? `Status: ${snapshot.run.status}`
          }
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
