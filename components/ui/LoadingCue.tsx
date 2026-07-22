import { cn } from "@/lib/cn";

/** Compact spinner used inside buttons and inline cues. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-4 w-4 animate-spin", className)}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Inline “something is happening” cue — indeterminate bar + label.
 * Use for hydration gaps, waiting on SSE, report refresh, etc.
 */
export function LoadingCue({
  label = "Loading",
  className,
  compact = false,
}: {
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={cn(
        "flex flex-col gap-3",
        compact ? "py-2" : "py-8",
        className,
      )}
    >
      <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className="absolute inset-y-0 w-full bg-gradient-to-r from-transparent via-teal-400 to-transparent"
          style={{ animation: "shimmer 1.4s ease-in-out infinite" }}
        />
      </div>
      <p className="flex items-center gap-2 font-mono text-xs text-dim">
        <Spinner className="text-teal-300" />
        {label}…
      </p>
    </div>
  );
}
