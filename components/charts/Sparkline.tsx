import { cn } from "@/lib/cn";

export type SparklineProps = {
  points: number[];
  min?: number;
  max?: number;
  width?: number;
  height?: number;
  tone?: "teal" | "warn" | "dim";
  band?: { lo: number; hi: number };
  ariaLabel: string;
  className?: string;
};

const STROKE: Record<NonNullable<SparklineProps["tone"]>, string> = {
  teal: "var(--color-teal-400)",
  warn: "var(--color-warn-400)",
  dim: "var(--color-dim)",
};

/** Tiny inline trend line (plans/10 §1.2). */
export function Sparkline({
  points,
  min,
  max,
  width = 84,
  height = 24,
  tone = "teal",
  band,
  ariaLabel,
  className,
}: SparklineProps) {
  if (points.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className={className}
      >
        <line
          x1={4}
          y1={height / 2}
          x2={width - 4}
          y2={height / 2}
          stroke="var(--color-faint)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const dataMin = min ?? Math.min(...points);
  const dataMax = max ?? Math.max(...points);
  const pad = (dataMax - dataMin) * 0.1 || 0.5;
  const lo = dataMin - pad;
  const hi = dataMax + pad;
  const span = hi - lo || 1;

  const coords = points.map((p, i) => {
    const x = points.length === 1 ? width / 2 : (i / (points.length - 1)) * (width - 4) + 2;
    const y = height - 2 - ((p - lo) / span) * (height - 4);
    return { x, y, p };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const last = coords[coords.length - 1]!;

  let bandPath: string | null = null;
  if (band) {
    const yHi = height - 2 - ((band.hi - lo) / span) * (height - 4);
    const yLo = height - 2 - ((band.lo - lo) / span) * (height - 4);
    bandPath = `M2,${yHi} L${width - 2},${yHi} L${width - 2},${yLo} L2,${yLo} Z`;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className={cn("overflow-visible", className)}
    >
      {bandPath && (
        <path d={bandPath} fill="var(--color-warn-400)" opacity={0.12} />
      )}
      <polyline
        points={polyline}
        fill="none"
        stroke={STROKE[tone]}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={2} fill={STROKE[tone]} />
    </svg>
  );
}
