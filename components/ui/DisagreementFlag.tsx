import { cn } from "@/lib/cn";
import { formatScore } from "@/lib/format";

export type DisagreementFlagProps = {
  spread: number; // max − min judge overall
  compact?: boolean;
  className?: string;
};

/** Rendered only when judge spread > 3 (plans/07 §3.9). */
export function DisagreementFlag({ spread, compact = false, className }: DisagreementFlagProps) {
  if (spread <= 3) return null;
  const label = `Judges disagreed — spread ${formatScore(spread)}`;

  if (compact) {
    return (
      <span role="img" aria-label={`${label}. Read this one yourself.`} className={cn("inline-flex", className)}>
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-warn-400" aria-hidden="true">
          <path d="M6 1.2L11 10H1z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
          <path d="M6 4.6v2.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="6" cy="8.6" r="0.7" fill="currentColor" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] border border-warn-400/30 bg-warn-900 px-2 py-1 text-xs text-warn-400",
        className,
      )}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 1.2L11 10H1z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
        <path d="M6 4.6v2.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="6" cy="8.6" r="0.7" fill="currentColor" />
      </svg>
      <span className="font-mono uppercase tracking-wider">Judges disagreed</span>
      <span aria-hidden="true">·</span>
      <span className="font-mono tabular-nums">spread {formatScore(spread)}</span>
      <span aria-hidden="true">·</span>
      <span>read this one yourself</span>
    </span>
  );
}
