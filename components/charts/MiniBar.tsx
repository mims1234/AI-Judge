import { cn } from "@/lib/cn";

export type MiniBarProps = {
  value: number;
  max: number;
  tone?: "teal" | "warn" | "info" | "pass" | "dim";
  label: string;
  format?: (v: number) => string;
  className?: string;
};

const FILL: Record<NonNullable<MiniBarProps["tone"]>, string> = {
  teal: "bg-teal-400",
  warn: "bg-warn-400",
  info: "bg-info-400",
  pass: "bg-pass-400",
  dim: "bg-dim",
};

/** Horizontal value bar with right-aligned mono label (plans/10 §1.4). */
export function MiniBar({
  value,
  max,
  tone = "teal",
  label,
  format = (v) => String(v),
  className,
}: MiniBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  return (
    <div
      className={cn("flex min-w-0 items-center gap-2", className)}
      role="img"
      aria-label={`${label}: ${format(value)}`}
    >
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-ink-700">
        <div
          className={cn("h-full rounded-sm", FILL[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums text-body">
        {format(value)}
      </span>
    </div>
  );
}
