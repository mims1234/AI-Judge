"use client";

import { cn } from "@/lib/cn";
import { formatScore } from "@/lib/format";

export type RadarSeries = {
  label: string;
  color: "teal" | "warn" | "info" | "pass";
  values: { category: string; score: number | null }[];
};

export type CategoryRadarProps = {
  categories: string[];
  series: RadarSeries[];
  size?: number;
  showLegend?: boolean;
  className?: string;
  /** Optional controlled visibility (legend toggles). Missing = all visible. */
  visibleLabels?: string[];
  onLegendClick?: (label: string) => void;
};

const STROKE: Record<RadarSeries["color"], string> = {
  teal: "var(--color-teal-400)",
  warn: "var(--color-warn-400)",
  info: "var(--color-info-400)",
  pass: "var(--color-pass-400)",
};

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function polar(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.sin(angleRad), y: cy - r * Math.cos(angleRad) };
}

/**
 * 8-axis category radar — dependency-free SVG (plans/10 §1.1).
 * Server-component-safe when used without legend click handlers.
 */
export function CategoryRadar({
  categories,
  series,
  size = 260,
  showLegend,
  className,
  visibleLabels,
  onLegendClick,
}: CategoryRadarProps) {
  const n = categories.length;
  const cx = 50;
  const cy = 50;
  const radius = 38;
  const legend = showLegend ?? series.length > 1;

  const angleAt = (i: number) => (i / Math.max(n, 1)) * Math.PI * 2;

  const rings = [2.5, 5, 7.5, 10];

  const ariaParts = series.map((s) => {
    const scores = s.values
      .map((v) => `${capitalize(v.category)} ${v.score == null ? "n/a" : formatScore(v.score)}`)
      .join(", ");
    return `${s.label} — ${scores}`;
  });

  const isVisible = (label: string) =>
    visibleLabels == null || visibleLabels.includes(label);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Radar: ${ariaParts.join("; ")}`}
      >
        {rings.map((score) => {
          const r = (score / 10) * radius;
          const pts = Array.from({ length: n }, (_, i) => {
            const p = polar(cx, cy, r, angleAt(i));
            return `${p.x},${p.y}`;
          }).join(" ");
          return (
            <polygon
              key={score}
              points={pts}
              fill="none"
              stroke="var(--color-line-subtle)"
              strokeWidth={0.5}
            />
          );
        })}

        {categories.map((cat, i) => {
          const tip = polar(cx, cy, radius, angleAt(i));
          const labelPos = polar(cx, cy, radius + 8, angleAt(i));
          return (
            <g key={cat}>
              <line
                x1={cx}
                y1={cy}
                x2={tip.x}
                y2={tip.y}
                stroke="var(--color-line-subtle)"
                strokeWidth={0.5}
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--color-dim)"
                fontSize={7}
                fontFamily="var(--font-sans, Inter, sans-serif)"
              >
                {capitalize(cat).slice(0, 6)}
              </text>
            </g>
          );
        })}

        {/* Draw later series first so series[0] sits on top */}
        {[...series].reverse().map((s) => {
          if (!isVisible(s.label)) return null;
          const byCat = new Map(s.values.map((v) => [v.category, v.score]));
          const points = categories.map((cat, i) => {
            const score = byCat.get(cat) ?? null;
            const r = score == null ? 0 : (score / 10) * radius;
            const p = polar(cx, cy, r, angleAt(i));
            return { ...p, hollow: score == null };
          });

          const poly = points.map((p) => `${p.x},${p.y}`).join(" ");
          const hasHollow = points.some((p) => p.hollow);

          return (
            <g key={s.label}>
              <polygon
                points={poly}
                fill={STROKE[s.color]}
                fillOpacity={0.12}
                stroke={STROKE[s.color]}
                strokeWidth={1.5}
                strokeDasharray={hasHollow ? "2 1.5" : undefined}
              />
              {points.map((p, i) =>
                p.hollow ? (
                  <circle
                    key={`${s.label}-h-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={1.5}
                    fill="none"
                    stroke={STROKE[s.color]}
                    strokeWidth={1}
                  />
                ) : (
                  <circle
                    key={`${s.label}-d-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={1.5}
                    fill={STROKE[s.color]}
                  />
                ),
              )}
            </g>
          );
        })}
      </svg>

      {legend && (
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Radar legend">
          {series.map((s) => {
            const on = isVisible(s.label);
            const interactive = !!onLegendClick;
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: STROKE[s.color], opacity: on ? 1 : 0.25 }}
                />
                <span className={cn("text-xs", on ? "text-body" : "text-faint line-through")}>
                  {s.label}
                </span>
              </>
            );
            return (
              <li key={s.label}>
                {interactive ? (
                  <button
                    type="button"
                    onClick={() => onLegendClick?.(s.label)}
                    aria-pressed={on}
                    className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 transition-colors duration-150 hover:bg-ink-800"
                  >
                    {body}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
