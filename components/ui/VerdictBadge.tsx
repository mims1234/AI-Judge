import { cn } from "@/lib/cn";

export type VerdictBadgeProps = {
  verdict: "pass" | "partial_pass" | "fail";
  size?: "sm" | "md";
  className?: string;
};

const STYLES = {
  pass: "bg-pass-900 text-pass-400",
  partial_pass: "bg-warn-900 text-warn-400",
  fail: "bg-fail-900 text-fail-400",
} as const;

const LABELS = {
  pass: "PASS",
  partial_pass: "PARTIAL",
  fail: "FAIL",
} as const;

function Icon({ verdict }: { verdict: VerdictBadgeProps["verdict"] }) {
  if (verdict === "pass") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M1.5 5.5l2.5 2.5 4.5-5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (verdict === "partial_pass") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <path d="M5 1.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Verdict badge — icon + uppercase label, never icon-only (plans/07 §3.2). */
export function VerdictBadge({ verdict, size = "md", className }: VerdictBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] font-mono uppercase tracking-wider",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        STYLES[verdict],
        className,
      )}
    >
      <Icon verdict={verdict} />
      {LABELS[verdict]}
    </span>
  );
}
