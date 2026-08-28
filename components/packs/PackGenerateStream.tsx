"use client";

import { StreamPanel } from "@/components/ui/StreamPanel";
import { ProgressRail } from "@/components/ui/ProgressRail";
import { generateProgress } from "@/lib/bundles/generate-progress";
import { cn } from "@/lib/cn";
import { GENERATE_PHASES, type GeneratePhase } from "@/lib/schemas";

const PHASE_LABEL: Record<GeneratePhase, string> = {
  connecting: "Connect",
  writing: "Writing",
  validating: "Validate",
  reviewing: "Review",
};

export function PackGenerateStream({
  phase,
  text,
  slotCount,
  modelId,
  notice,
  status,
}: {
  phase: GeneratePhase;
  text: string;
  slotCount: number;
  modelId: string;
  notice?: string | null;
  status: "streaming" | "done" | "error";
}) {
  const failed = status === "error";
  const done = status === "done";
  const progress = generateProgress({
    phase,
    text,
    slotCount,
    done,
    failed,
  });
  const currentIndex = GENERATE_PHASES.indexOf(phase);

  return (
    <section
      className="flex flex-col gap-4 rounded-md border border-line-subtle bg-ink-900 p-4"
      data-testid="pack-generate-stream"
      aria-busy={status === "streaming"}
      aria-label="Pack generation"
    >
      <ol aria-label="Generation progress" className="flex items-center gap-0">
        {GENERATE_PHASES.map((step, i) => {
          const active = !failed && !done && i === currentIndex;
          const complete = done || i < currentIndex;
          const failedHere = failed && i === currentIndex;
          return (
            <li key={step} className="flex min-w-0 flex-1 items-center">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px flex-1 transition-colors duration-500",
                    complete || active || failedHere
                      ? "bg-teal-400/60"
                      : "bg-line-subtle",
                  )}
                />
              )}
              <span className="flex min-w-0 flex-col items-center gap-1 px-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-mono",
                    complete && "border-teal-400 bg-teal-400 text-ink-950",
                    active && "border-teal-400 text-teal-300 pulse-dot",
                    failedHere && "border-fail-400 bg-fail-900 text-fail-400",
                    !complete && !active && !failedHere &&
                      "border-line-strong text-faint",
                  )}
                >
                  {complete ? "✓" : failedHere ? "✕" : ""}
                </span>
                <span
                  className={cn(
                    "truncate font-mono text-[10px] uppercase tracking-wide",
                    active || complete
                      ? "text-teal-300"
                      : failedHere
                        ? "text-fail-400"
                        : "text-faint",
                  )}
                >
                  {PHASE_LABEL[step]}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2">
        <ProgressRail
          value={progress.value}
          max={progress.max}
          label={progress.label}
        />
        <p className="font-mono text-xs text-dim">
          {progress.label}
          {notice ? ` · ${notice}` : ""}
        </p>
      </div>

      <StreamPanel
        text={text}
        status={status === "error" ? "error" : status === "done" ? "done" : "streaming"}
        label={`Generator — ${modelId}`}
        maxHeight={280}
      />
    </section>
  );
}
