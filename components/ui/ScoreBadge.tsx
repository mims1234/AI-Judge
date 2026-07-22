import { cn } from "@/lib/cn";
import { formatScore, scoreBand } from "@/lib/format";

export type ScoreBadgeProps = {
  score: number | null; // 0–10, one decimal; null = not yet scored
  size?: "sm" | "md" | "lg"; // sm=table cells, md=cards, lg=arena cells/hero
  showOutOf?: boolean; // renders "/10" suffix
  className?: string;
};

const SIZES = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-1 text-sm",
  lg: "px-3 py-1.5 text-lg",
} as const;

/** Mono score numeral on the score-ramp band colors (plans/07 §3.1). */
export function ScoreBadge({ score, size = "md", showOutOf = false, className }: ScoreBadgeProps) {
  if (score == null) {
    return (
      <span
        aria-label="not yet scored"
        className={cn(
          "inline-flex items-baseline rounded-[4px] bg-ink-800 font-mono tabular-nums text-faint",
          SIZES[size],
          className,
        )}
      >
        —
      </span>
    );
  }

  const band = scoreBand(score);
  return (
    <span
      aria-label={`score ${formatScore(score)} out of 10`}
      className={cn(
        "inline-flex items-baseline rounded-[4px] font-mono tabular-nums",
        band.text,
        band.bg,
        SIZES[size],
        className,
      )}
    >
      {formatScore(score)}
      {showOutOf && <span className="ml-0.5 text-[0.75em] opacity-60">/10</span>}
    </span>
  );
}
