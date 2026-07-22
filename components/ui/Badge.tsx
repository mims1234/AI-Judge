import { cn } from "@/lib/cn";

export type BadgeProps = {
  children: React.ReactNode;
  tone?: "neutral" | "teal" | "warn" | "fail" | "pass" | "info";
  className?: string;
  title?: string;
};

const TONES = {
  neutral: "bg-ink-800 text-dim border-line-subtle",
  teal: "bg-teal-900 text-teal-300 border-teal-400/30",
  warn: "bg-warn-900 text-warn-400 border-warn-400/30",
  fail: "bg-fail-900 text-fail-400 border-fail-400/30",
  pass: "bg-pass-900 text-pass-400 border-pass-400/30",
  info: "bg-ink-800 text-info-400 border-info-400/30",
} as const;

/** Neutral metadata pill — context lengths, prices, statuses (plans/07 §3.8). */
export function Badge({ children, tone = "neutral", className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 font-mono text-xs whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
