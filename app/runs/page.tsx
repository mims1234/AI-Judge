import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  formatRelativeTime,
  formatUsd,
  shortId,
} from "@/lib/format";
import type { RunStatus } from "@/lib/schemas";
import { listRuns } from "@/lib/server/runs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Runs",
};

function statusTone(
  status: RunStatus,
): "neutral" | "teal" | "warn" | "fail" | "pass" {
  switch (status) {
    case "running":
    case "queued":
      return "teal";
    case "paused":
      return "warn";
    case "completed":
      return "pass";
    case "incomplete":
      return "fail";
    case "cancelled":
    default:
      return "neutral";
  }
}

export default function RunsPage() {
  const runs = listRuns(50);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
            Runs
          </h1>
          <p className="mt-1 text-sm text-dim">
            Open any past or live run. Completed runs open in replay.
          </p>
        </div>
        <Link href="/run" className={buttonClasses({ variant: "primary" })}>
          New run
        </Link>
      </div>

      {runs.length === 0 ? (
        <EmptyState
          title="No runs yet"
          body="Configure a benchmark and launch one — it will show up here."
          action={
            <Link href="/run" className={buttonClasses({ variant: "primary" })}>
              Configure a run
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line-subtle bg-ink-900">
          <table className="min-w-full border-collapse">
            <caption className="sr-only">Benchmark runs</caption>
            <thead>
              <tr className="border-b border-line-subtle text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-3 font-medium">Run</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Bundle</th>
                <th className="px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium">Models</th>
                <th className="px-4 py-3 text-right font-medium">Cost</th>
                <th className="px-4 py-3 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className="border-b border-line-subtle/60 last:border-0 transition-colors hover:bg-ink-800/80"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/runs/${run.id}`}
                      className="font-mono text-sm text-teal-300 hover:text-teal-200"
                    >
                      {shortId(run.id)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-body">
                    {run.bundle_slug}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-dim">
                    {run.scored_count}/{run.task_total}
                    {run.error_count > 0 ? (
                      <span className="text-fail-400"> · {run.error_count} err</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-dim">
                    {run.candidate_count}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-body">
                    {formatUsd(run.total_cost_usd)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-dim">
                    {formatRelativeTime(run.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
