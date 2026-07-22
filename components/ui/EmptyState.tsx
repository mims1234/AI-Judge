import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  title: string;
  body?: string;
  action?: React.ReactNode;
  glyph?: React.ReactNode;
  className?: string;
};

function DefaultGlyph() {
  // Minimal bench-grid + signal motif
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className="text-faint">
      <rect x="4" y="4" width="32" height="32" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 14h32M4 24h32M14 4v32M24 4v32" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <rect x="16" y="16" width="6" height="6" rx="1" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

/** Centered empty-state block: glyph, one-line explanation, primary action (plans/07 §3.8). */
export function EmptyState({ title, body, action, glyph, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-line-subtle bg-ink-900 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="mb-4">{glyph ?? <DefaultGlyph />}</div>
      <p className="max-w-md text-base text-bright">{title}</p>
      {body && <p className="mt-1.5 max-w-md text-sm text-dim">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
