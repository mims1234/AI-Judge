import { cn } from "@/lib/cn";

export type StatCardProps = {
  label: string; // "Total cost", "Elapsed", "Median score"
  value: string; // preformatted, mono
  sub?: string; // secondary line, e.g. "of $2.00 cap"
  tone?: "default" | "accent" | "warn" | "fail";
  icon?: React.ReactNode;
  className?: string;
};

const TONE_BORDERS = {
  default: "",
  accent: "border-l-2 border-l-teal-400",
  warn: "border-l-2 border-l-warn-400",
  fail: "border-l-2 border-l-fail-400",
} as const;

/** Level-1 metric card with mono tabular value (plans/07 §3.6). */
export function StatCard({ label, value, sub, tone = "default", icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-line-subtle bg-ink-900 p-4",
        TONE_BORDERS[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-dim">{label}</div>
        {icon && <div className="text-faint">{icon}</div>}
      </div>
      <div className="mt-1.5 font-mono text-2xl tabular-nums text-bright">{value}</div>
      {sub && <div className="mt-0.5 text-sm text-dim">{sub}</div>}
    </div>
  );
}
