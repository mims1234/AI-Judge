"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StaffPanel } from "@/components/admin/StaffPanel";
import { TrendChart } from "@/components/admin/TrendChart";
import { MiniBar } from "@/components/charts/MiniBar";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";
import type { StaffMember } from "@/lib/staff";
import {
  TRAFFIC_RANGE_DAYS,
  seriesGrainForDays,
  type TrafficRangeDays,
  type TrafficStats,
} from "@/lib/traffic";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString();
}

function deltaLabel(
  current: number,
  previous: number,
  complete: boolean,
): string {
  if (!complete) return "prior window incomplete";
  if (previous <= 0 && current <= 0) return "vs prior window";
  if (previous <= 0) return "new vs prior window";
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}% vs prior window`;
}

export function AdminDashboard({
  initial,
  staff,
  canManageStaff,
}: {
  initial: TrafficStats;
  staff: StaffMember[];
  canManageStaff: boolean;
}) {
  const { status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState(initial);
  const [range, setRange] = useState<TrafficRangeDays>(initial.days);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rangeAbort = useRef<AbortController | null>(null);
  const rangeGen = useRef(0);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    return () => rangeAbort.current?.abort();
  }, []);

  const loadStats = async (days: TrafficRangeDays) => {
    setLoading(true);
    setError(null);
    rangeAbort.current?.abort();
    const ac = new AbortController();
    rangeAbort.current = ac;
    const gen = ++rangeGen.current;
    try {
      const res = await fetch(`/api/admin/stats?days=${days}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      if (gen !== rangeGen.current) return;
      if (!res.ok) {
        setError("Could not refresh traffic.");
        return;
      }
      setStats((await res.json()) as TrafficStats);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (gen !== rangeGen.current) return;
      setError("Could not refresh traffic.");
    } finally {
      if (gen === rangeGen.current) setLoading(false);
    }
  };

  const onRange = (key: string) => {
    const days = Number(key) as TrafficRangeDays;
    if (!(TRAFFIC_RANGE_DAYS as readonly number[]).includes(days)) return;
    setRange(days);
    void loadStats(days);
  };

  const pathMax = Math.max(1, ...stats.paths.map((p) => p.views));

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10 md:px-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
            Admin
          </h1>
          <p className="mt-1 text-sm text-dim">
            Site traffic from first-party daily rollups — no raw pageview log.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            ariaLabel="Traffic range"
            activeKey={String(range)}
            onChange={onRange}
            tabs={TRAFFIC_RANGE_DAYS.map((d) => ({
              key: String(d),
              label: `${d}d`,
            }))}
          />
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            onClick={() => void loadStats(range)}
            aria-label="Refresh traffic stats"
            data-testid="admin-refresh-stats"
          >
            ↻ Refresh
          </Button>
        </div>
      </header>

      {error && (
        <p role="alert" className="text-sm text-fail-400">
          {error}
        </p>
      )}

      <div
        className={cn(
          "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
          loading && "opacity-70",
        )}
      >
        <StatCard
          label="Views today"
          value={formatCount(stats.today.views)}
          sub={`${formatCount(stats.today.uniques)} unique today`}
          tone="accent"
        />
        <StatCard
          label={`${range}-day views`}
          value={formatCount(stats.totals.views)}
          sub={deltaLabel(
            stats.totals.views,
            stats.previous.views,
            stats.previous.complete,
          )}
        />
        <StatCard
          label={`${range}-day unique`}
          value={formatCount(stats.totals.uniques)}
          sub={deltaLabel(
            stats.totals.uniques,
            stats.previous.uniques,
            stats.previous.complete,
          )}
        />
        <StatCard
          label="Avg views / day"
          value={formatCount(Math.round(stats.totals.avg_views_per_day))}
          sub={`${stats.from} → ${stats.to} UTC`}
        />
      </div>

      <TrendChart
        series={stats.series}
        grain={stats.grain ?? seriesGrainForDays(stats.days)}
      />

      <section className="rounded-md border border-line-subtle bg-ink-900 p-4">
        <h2 className="font-display text-lg uppercase tracking-[0.08em] text-bright">
          Top paths
        </h2>
        <p className="mt-1 text-xs text-dim">
          IDs collapsed so the table stays small (/runs/:id).
        </p>
        {stats.paths.length === 0 ? (
          <p className="py-10 text-center text-sm text-dim">
            Paths appear after the first recorded views.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2.5" role="list">
            {stats.paths.map((row) => (
              <li key={row.path} className="grid grid-cols-[minmax(0,12rem)_1fr] items-center gap-3">
                <span className="truncate font-mono text-xs text-body" title={row.path}>
                  {row.path}
                </span>
                <MiniBar
                  value={row.views}
                  max={pathMax}
                  label={row.path}
                  format={formatCount}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <StaffPanel initial={staff} canManage={canManageStaff} />
    </div>
  );
}
