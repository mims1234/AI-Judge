"use client";

import { useMemo, useState } from "react";
import { Sparkline } from "@/components/charts/Sparkline";
import { RowExpansion } from "@/components/leaderboard/RowExpansion";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  formatLatency,
  formatPercent,
  formatRelativeTime,
  formatScore,
  formatUsd,
} from "@/lib/format";
import type { LeaderboardRow } from "@/lib/scoring";

export type LeaderboardTableProps = {
  rows: LeaderboardRow[];
  bundleSlug: string;
  demo?: boolean;
};

function providerOf(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(0, slash);
}

function modelName(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

type SortKey =
  | "rank"
  | "score"
  | "complete_runs"
  | "success_rate"
  | "avg_cost_usd_per_run"
  | "avg_latency_ms"
  | "last_evaluated_at";

function sortRows(rows: LeaderboardRow[], key: SortKey, dir: "asc" | "desc"): LeaderboardRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    // Provisional always sorts below ranked for rank/score defaults
    if (key === "rank" || key === "score") {
      if (a.provisional !== b.provisional) return a.provisional ? 1 : -1;
    }
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * mul;
    }
    return ((av as number) - (bv as number)) * mul;
  });
}

/** Sortable expandable leaderboard (plans/10 §2.2). */
export function LeaderboardTable({ rows, bundleSlug, demo }: LeaderboardTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "score",
    dir: "desc",
  });

  const sorted = useMemo(
    () => sortRows(rows, sort.key, sort.dir),
    [rows, sort],
  );

  const columns: Column<LeaderboardRow>[] = [
    {
      key: "rank",
      header: "Rank",
      mono: true,
      sortable: true,
      render: (r) =>
        r.provisional ? (
          <span className="text-dim">—</span>
        ) : (
          <span className="text-bright">{r.rank}</span>
        ),
    },
    {
      key: "model",
      header: "Model",
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-bright">{modelName(r.model_id)}</span>
          <span className="truncate font-mono text-[11px] text-dim">
            {providerOf(r.model_id)}
          </span>
          {r.provisional && (
            <Tooltip content={`fewer than 3 complete runs — median of ${r.complete_runs} run${r.complete_runs === 1 ? "" : "s"} shown`}>
              <span className="mt-0.5 w-fit">
                <Badge tone="warn">PROVISIONAL</Badge>
              </span>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      key: "score",
      header: "Median",
      sortable: true,
      align: "right",
      render: (r) => <ScoreBadge score={r.score} size="sm" />,
    },
    {
      key: "disagreement",
      header: "Disagreement",
      className: "hidden md:table-cell",
      render: (r) => {
        const latest = r.spread_history[r.spread_history.length - 1] ?? r.disagreement_mean;
        return (
          <span className="inline-flex items-center gap-2">
            <Sparkline
              points={r.spread_history}
              tone={latest > 3 ? "warn" : "dim"}
              ariaLabel={`Disagreement history, latest ${formatScore(latest)}`}
            />
            <span className="font-mono text-xs tabular-nums text-dim">
              {formatScore(latest)}
            </span>
          </span>
        );
      },
    },
    {
      key: "complete_runs",
      header: "Runs",
      mono: true,
      sortable: true,
      render: (r) => r.complete_runs,
    },
    {
      key: "success_rate",
      header: "Success",
      mono: true,
      sortable: true,
      render: (r) => formatPercent(r.success_rate),
    },
    {
      key: "avg_cost_usd_per_run",
      header: "Cost",
      mono: true,
      sortable: true,
      render: (r) => formatUsd(r.avg_cost_usd_per_run),
    },
    {
      key: "avg_latency_ms",
      header: "Latency",
      mono: true,
      sortable: true,
      className: "hidden lg:table-cell",
      render: (r) => formatLatency(r.avg_latency_ms),
    },
    {
      key: "last_evaluated_at",
      header: "Last",
      mono: true,
      sortable: true,
      className: "hidden lg:table-cell",
      render: (r) => formatRelativeTime(r.last_evaluated_at),
    },
  ];

  // Mobile card list
  return (
    <>
      <div className="md:hidden space-y-2">
        {sorted.map((r, i) => {
          const open = expanded === r.model_id;
          return (
            <div
              key={r.model_id}
              className="rank-enter rounded-md border border-line-subtle bg-ink-900"
              style={{ ["--rank-index" as string]: Math.min(i, 9) }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-3 text-left"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : r.model_id)}
              >
                <span className="w-6 font-mono text-sm tabular-nums text-dim">
                  {r.provisional ? "—" : r.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-bright">
                    {modelName(r.model_id)}
                  </span>
                  <span className="font-mono text-[11px] text-dim">
                    {r.complete_runs} run{r.complete_runs === 1 ? "" : "s"}
                  </span>
                </span>
                <ScoreBadge score={r.score} size="sm" />
                {r.provisional && <Badge tone="warn">P</Badge>}
              </button>
              {open && (
                <div className="border-t border-line-subtle">
                  <RowExpansion row={r} bundleSlug={bundleSlug} demo={demo} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          rows={sorted}
          rowKey={(r) => r.model_id}
          caption={`Leaderboard for ${bundleSlug}`}
          stickyHeader
          sort={sort}
          onSort={(key) => {
            const k = key as SortKey;
            setSort((prev) =>
              prev.key === k
                ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" }
                : { key: k, dir: k === "score" || k === "rank" ? "desc" : "asc" },
            );
          }}
          expandable={{
            isExpanded: (r) => expanded === r.model_id,
            onToggle: (r) =>
              setExpanded((cur) => (cur === r.model_id ? null : r.model_id)),
            render: (r) => (
              <RowExpansion row={r} bundleSlug={bundleSlug} demo={demo} />
            ),
          }}
          rowClassName={() => "rank-enter"}
          rowTestId={(r) => `leaderboard-row-${r.model_id}`}
        />
      </div>
    </>
  );
}
