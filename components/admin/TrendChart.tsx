"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { TrafficGrain, TrafficSeriesPoint } from "@/lib/traffic";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatDay(day: string, compact: boolean): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const month = MONTHS[m - 1] ?? "Jan";
  if (compact) return `${month} ${d}`;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
  return `${weekday} ${month} ${d}`;
}

function formatMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  if (!y || !m) return day;
  return `${MONTHS[m - 1] ?? "Jan"} ${y}`;
}

function niceMax(n: number): number {
  if (n <= 0) return 4;
  const raw = n * 1.15;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * pow;
}

export function TrendChart({
  series,
  grain = "day",
  className,
}: {
  series: TrafficSeriesPoint[];
  grain?: TrafficGrain;
  className?: string;
}) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const monthly = grain === "month";

  const width = 720;
  const height = 260;
  const pad = { top: 18, right: 16, bottom: 36, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const { max, points } = useMemo(() => {
    const peak = Math.max(0, ...series.map((p) => Math.max(p.views, p.uniques)));
    const m = niceMax(peak);
    const pts = series.map((p, i) => {
      const x = monthly
        ? pad.left + ((i + 0.5) / Math.max(series.length, 1)) * innerW
        : series.length <= 1
          ? pad.left + innerW / 2
          : pad.left + (i / (series.length - 1)) * innerW;
      return {
        ...p,
        x,
        yViews: pad.top + innerH - (p.views / m) * innerH,
        yUniques: pad.top + innerH - (p.uniques / m) * innerH,
      };
    });
    return { max: m, points: pts };
  }, [series, monthly, innerH, innerW, pad.left, pad.top]);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const labelEvery = monthly || series.length <= 10 ? 1 : 7;
  const spanYears = new Set(series.map((p) => p.day.slice(0, 4))).size > 1;
  const active = hover != null ? points[hover] : points[points.length - 1];
  const slot = innerW / Math.max(series.length, 1);

  const viewsLine = points.map((p) => `${p.x},${p.yViews}`).join(" ");
  const uniquesLine = points.map((p) => `${p.x},${p.yUniques}`).join(" ");
  const area =
    points.length === 0
      ? ""
      : `M${points[0]!.x},${pad.top + innerH} ` +
        points.map((p) => `L${p.x},${p.yViews}`).join(" ") +
        ` L${points[points.length - 1]!.x},${pad.top + innerH} Z`;

  const axisLabel = (day: string) =>
    monthly ? (spanYears ? formatMonth(day) : formatMonth(day).slice(0, 3)) : formatDay(day, true);
  const hoverLabel = (day: string) => (monthly ? formatMonth(day) : formatDay(day, false));

  return (
    <div className={cn("rounded-md border border-line-subtle bg-ink-900 p-4", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg uppercase tracking-[0.08em] text-bright">
            Traffic
          </h2>
          <p className="text-xs text-dim">
            {monthly
              ? "Monthly page views and unique visitors (UTC)"
              : "Daily page views and unique visitors (UTC)"}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5 text-body">
            <span className="h-1.5 w-4 rounded-sm bg-teal-400" aria-hidden="true" />
            Views
          </span>
          <span className="inline-flex items-center gap-1.5 text-dim">
            <span className="h-1.5 w-4 rounded-sm bg-dim" aria-hidden="true" />
            Unique
          </span>
        </div>
      </div>

      {series.every((p) => p.views === 0) ? (
        <p className="py-16 text-center text-sm text-dim">
          No page views in this window yet.
        </p>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[260px] w-full"
            role="img"
            aria-label={
              monthly
                ? "Monthly site views and unique visitors"
                : "Daily site views and unique visitors"
            }
          >
            <defs>
              <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-teal-400)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--color-teal-400)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {ticks.map((tick) => {
              const y = pad.top + innerH - (tick / max) * innerH;
              return (
                <g key={tick}>
                  <line
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={y}
                    y2={y}
                    stroke="var(--color-line-subtle)"
                    strokeWidth={1}
                  />
                  <text
                    x={pad.left - 8}
                    y={y + 3}
                    textAnchor="end"
                    fill="var(--color-faint)"
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {points.map((p, i) => {
              const labeled =
                labelEvery === 1 ||
                i === 0 ||
                i === points.length - 1 ||
                (i % labelEvery === 0 && points.length - 1 - i >= 4);
              if (!labeled) return null;
              return (
                <text
                  key={p.day}
                  x={p.x}
                  y={height - 8}
                  textAnchor="middle"
                  fill="var(--color-faint)"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                >
                  {axisLabel(p.day)}
                </text>
              );
            })}

            {monthly
              ? points.map((p, i) => {
                  const group = Math.min(slot * 0.62, 72);
                  const barW = group / 2 - 2;
                  const viewsH = pad.top + innerH - p.yViews;
                  const uniquesH = pad.top + innerH - p.yUniques;
                  return (
                    <g key={p.day}>
                      <rect
                        x={p.x - group / 2}
                        y={p.yViews}
                        width={barW}
                        height={Math.max(viewsH, 0)}
                        rx={2}
                        fill="var(--color-teal-400)"
                        opacity={active === p ? 1 : 0.82}
                      />
                      <rect
                        x={p.x + 2}
                        y={p.yUniques}
                        width={barW}
                        height={Math.max(uniquesH, 0)}
                        rx={2}
                        fill="var(--color-dim)"
                        opacity={active === p ? 0.95 : 0.7}
                      />
                      <rect
                        x={p.x - slot / 2}
                        y={pad.top}
                        width={Math.max(slot, 16)}
                        height={innerH}
                        fill="transparent"
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover(null)}
                      >
                        <title>
                          {`${hoverLabel(p.day)}: ${p.views} views, ${p.uniques} unique`}
                        </title>
                      </rect>
                    </g>
                  );
                })
              : (
                <>
                  {area && <path d={area} fill={`url(#${gid}-fill)`} />}
                  <polyline
                    points={uniquesLine}
                    fill="none"
                    stroke="var(--color-dim)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <polyline
                    points={viewsLine}
                    fill="none"
                    stroke="var(--color-teal-400)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {active && (
                    <>
                      <line
                        x1={active.x}
                        x2={active.x}
                        y1={pad.top}
                        y2={pad.top + innerH}
                        stroke="var(--color-line-strong)"
                        strokeDasharray="3 3"
                      />
                      <circle cx={active.x} cy={active.yViews} r={3.5} fill="var(--color-teal-400)" />
                      <circle cx={active.x} cy={active.yUniques} r={3} fill="var(--color-dim)" />
                    </>
                  )}
                  {points.map((p, i) => (
                    <rect
                      key={p.day}
                      x={p.x - slot / 2}
                      y={pad.top}
                      width={Math.max(slot, 8)}
                      height={innerH}
                      fill="transparent"
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <title>
                        {`${p.day}: ${p.views} views, ${p.uniques} unique`}
                      </title>
                    </rect>
                  ))}
                </>
              )}
          </svg>

          {active && (
            <div
              className="pointer-events-none absolute right-4 top-0 rounded-md border border-line-strong bg-ink-850 px-3 py-2 text-xs shadow-raised"
              role="status"
            >
              <div className="font-mono text-dim">{hoverLabel(active.day)}</div>
              <div className="mt-1 tabular-nums text-teal-300">
                {active.views.toLocaleString()} views
              </div>
              <div className="tabular-nums text-body">
                {active.uniques.toLocaleString()} unique
              </div>
            </div>
          )}
        </div>
      )}

      <table className="sr-only">
        <caption>{monthly ? "Monthly traffic" : "Daily traffic"}</caption>
        <thead>
          <tr>
            <th>{monthly ? "Month" : "Day"}</th>
            <th>Views</th>
            <th>Unique visitors</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.day}>
              <td>{monthly ? formatMonth(p.day) : p.day}</td>
              <td>{p.views}</td>
              <td>{p.uniques}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
