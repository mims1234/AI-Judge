"use client";

import { useState } from "react";
import { CategoryRadar, type RadarSeries } from "@/components/charts/CategoryRadar";
import { StatCard } from "@/components/ui/StatCard";
import {
  formatPercent,
  formatScore,
  formatUsd,
} from "@/lib/format";
import { CATEGORY_ORDER } from "@/lib/schemas";
import type { LeaderboardRow } from "@/lib/scoring";
import type { ModelRunStats } from "@/lib/analytics/types";

export type CompareOverviewProps = {
  rows: LeaderboardRow[];
  stats: Record<string, ModelRunStats>;
};

const SERIES_COLORS: RadarSeries["color"][] = ["teal", "warn", "info", "pass"];

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function scorePerDollar(median: number | null, cost: number): number | null {
  if (median == null || cost <= 0) return null;
  return median / cost;
}

/** Shared radar + per-model StatCards (plans/10 §3.1). */
export function CompareOverview({ rows, stats }: CompareOverviewProps) {
  const series: RadarSeries[] = rows.map((r, i) => ({
    label: modelShort(r.model_id),
    color: SERIES_COLORS[i % SERIES_COLORS.length]!,
    values: CATEGORY_ORDER.map((c) => ({
      category: c,
      score: r.category_medians[c] ?? null,
    })),
  }));

  const [visible, setVisible] = useState<string[]>(series.map((s) => s.label));

  return (
    <section aria-labelledby="compare-overview-heading" className="flex flex-col gap-4">
      <h2 id="compare-overview-heading" className="text-sm uppercase tracking-wide text-dim">
        Overview
      </h2>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <CategoryRadar
          categories={[...CATEGORY_ORDER]}
          series={series}
          size={260}
          visibleLabels={visible}
          onLegendClick={(label) => {
            setVisible((cur) =>
              cur.includes(label)
                ? cur.length === 1
                  ? cur
                  : cur.filter((x) => x !== label)
                : [...cur, label],
            );
          }}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => {
            const st = stats[r.model_id];
            const spd = scorePerDollar(st?.medianScore ?? r.score, r.avg_cost_usd_per_run);
            return (
              <div key={r.model_id} className="rounded-md border border-line-subtle bg-ink-900 p-3">
                <div className="mb-2 truncate text-sm text-bright">
                  {modelShort(r.model_id)}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Median" value={formatScore(r.score)} className="p-3" />
                  <StatCard
                    label="Runs"
                    value={String(st?.completeRuns ?? r.complete_runs)}
                    className="p-3"
                  />
                  <StatCard
                    label="Success"
                    value={formatPercent(r.success_rate)}
                    className="p-3"
                  />
                  <StatCard
                    label="Cost / run"
                    value={formatUsd(r.avg_cost_usd_per_run)}
                    sub={spd != null ? `${spd.toFixed(1)} pts/$` : undefined}
                    className="p-3"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
