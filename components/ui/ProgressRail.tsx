import { cn } from "@/lib/cn";

export type ProgressSegment = {
  value: number;
  tone: "teal" | "pass" | "fail" | "warn";
};

export type ProgressRailProps = {
  value: number;
  max: number;
  segments?: ProgressSegment[]; // optional stacked segments
  label: string; // for aria
  className?: string;
};

const TONES: Record<ProgressSegment["tone"], string> = {
  teal: "bg-teal-500",
  pass: "bg-pass-400",
  fail: "bg-fail-400",
  warn: "bg-warn-400",
};

/** Thin determinate progress bar (plans/07 §3.5). */
export function ProgressRail({ value, max, segments, label, className }: ProgressRailProps) {
  const safeMax = Math.max(max, 1);
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn("flex h-1.5 overflow-hidden rounded-full bg-ink-700", className)}
    >
      {segments
        ? segments.map((seg, i) => (
            <div
              key={i}
              className={cn("h-full transition-[width] duration-300 ease-out", TONES[seg.tone])}
              style={{ width: `${Math.min(100, (seg.value / safeMax) * 100)}%` }}
            />
          ))
        : (
          <div
            className="h-full bg-teal-500 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.min(100, (value / safeMax) * 100)}%` }}
          />
        )}
    </div>
  );
}
