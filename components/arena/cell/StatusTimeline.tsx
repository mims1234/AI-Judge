"use client";

import { cn } from "@/lib/cn";
import type { TaskResultStatus } from "@/lib/schemas";

const STEPS = [
  { key: "pending", label: "Pending" },
  { key: "streaming", label: "Streaming" },
  { key: "validating", label: "Validating" },
  { key: "judging", label: "Judging" },
  { key: "scored", label: "Scored" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function resolveIndex(
  status: TaskResultStatus,
  errorKind: "infra_failure" | "judging_failure" | undefined,
): { current: number; failedAt: number | null } {
  if (status === "error") {
    const at: StepKey = errorKind === "judging_failure" ? "judging" : "streaming";
    const idx = STEPS.findIndex((s) => s.key === at);
    return { current: idx, failedAt: idx };
  }
  return {
    current: STEPS.findIndex((s) => s.key === status),
    failedAt: null,
  };
}

/**
 * Live status stepper: pending → streaming → validating → judging → scored
 * (plans/15 §A3). Driven by task.status events; error pins the failed phase.
 */
export function StatusTimeline({
  status,
  errorKind,
}: {
  status: TaskResultStatus | undefined;
  errorKind?: "infra_failure" | "judging_failure";
}) {
  const { current, failedAt } = resolveIndex(status ?? "pending", errorKind);

  return (
    <ol
      aria-label="Task progress"
      className="flex items-center gap-0"
      data-testid="cell-status-timeline"
    >
      {STEPS.map((step, i) => {
        const done = failedAt == null ? i < current : i < failedAt;
        const active = failedAt == null && i === current && status !== "scored";
        const complete = failedAt == null && status === "scored" && i === current;
        const failed = failedAt === i;

        return (
          <li key={step.key} className="flex min-w-0 flex-1 items-center">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "h-px flex-1 transition-colors duration-500",
                  done || active || complete || failed ? "bg-teal-400/60" : "bg-line-subtle",
                )}
              />
            )}
            <span className="flex min-w-0 flex-col items-center gap-1 px-2">
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-mono",
                  done && "border-teal-400 bg-teal-400 text-ink-950",
                  active && "border-teal-400 text-teal-300 pulse-dot",
                  complete && "border-teal-400 bg-teal-400 text-ink-950 score-pop",
                  failed && "border-fail-400 bg-fail-900 text-fail-400",
                  !done && !active && !complete && !failed && "border-line-strong text-faint",
                )}
              >
                {done || complete ? "✓" : failed ? "✕" : ""}
              </span>
              <span
                className={cn(
                  "truncate font-mono text-[10px] uppercase tracking-wide",
                  active || complete ? "text-teal-300" : failed ? "text-fail-400" : done ? "text-dim" : "text-faint",
                )}
              >
                {step.label}
              </span>
            </span>
            {i === STEPS.length - 1 && <span className="h-px flex-1 bg-transparent" aria-hidden="true" />}
          </li>
        );
      })}
      <span className="sr-only">
        {failedAt != null
          ? `failed during ${STEPS[failedAt]?.label}`
          : `currently ${status ?? "pending"}`}
      </span>
    </ol>
  );
}
