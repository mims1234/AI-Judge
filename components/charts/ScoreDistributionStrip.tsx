"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { formatScore } from "@/lib/format";

export type ScoreDistributionStripProps = {
  marks: { value: number; label: string; tone?: "teal" | "warn" | "fail" | "pass" }[];
  median?: number;
  width?: number;
  ariaLabel: string;
  className?: string;
};

const TONE_BG: Record<NonNullable<ScoreDistributionStripProps["marks"][number]["tone"]>, string> = {
  teal: "bg-teal-400",
  warn: "bg-warn-400",
  fail: "bg-fail-400",
  pass: "bg-pass-400",
};

/** Compact 0–10 rail with per-mark ticks (plans/10 §1.3). */
export function ScoreDistributionStrip({
  marks,
  median,
  width = 160,
  ariaLabel,
  className,
}: ScoreDistributionStripProps) {
  const clamp = (v: number) => Math.max(0, Math.min(10, v));

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn("relative h-5", className)}
      style={{ width }}
    >
      <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 rounded-full bg-ink-700" />
      {median != null && (
        <div
          className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-bright"
          style={{ left: `${(clamp(median) / 10) * 100}%` }}
          title={`median ${formatScore(median)}`}
        />
      )}
      {marks.map((m, i) => (
        <Tooltip key={`${m.label}-${i}`} content={`${m.label}: ${formatScore(m.value)}`}>
          <button
            type="button"
            className={cn(
              "absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus",
              TONE_BG[m.tone ?? "teal"],
            )}
            style={{ left: `${(clamp(m.value) / 10) * 100}%` }}
            aria-label={`${m.label}: ${formatScore(m.value)}`}
          />
        </Tooltip>
      ))}
    </div>
  );
}
