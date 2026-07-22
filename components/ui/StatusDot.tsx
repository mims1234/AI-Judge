import { cn } from "@/lib/cn";

export type StatusDotTone =
  | "idle"
  | "streaming"
  | "validating"
  | "judging"
  | "done"
  | "error";

export type StatusDotProps = {
  tone: StatusDotTone;
  label?: string;
  className?: string;
};

const DOTS: Record<StatusDotTone, string> = {
  idle: "bg-faint",
  streaming: "bg-teal-400 pulse-dot",
  validating: "bg-info-400",
  judging: "bg-warn-400 pulse-dot",
  done: "bg-pass-400",
  error: "bg-fail-400",
};

/** 8px status dot + optional label (plans/07 §3.8). */
export function StatusDot({ tone, label, className }: StatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", DOTS[tone])} />
      {label && <span className="text-xs text-dim">{label}</span>}
    </span>
  );
}
