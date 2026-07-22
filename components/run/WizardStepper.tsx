"use client";

import { cn } from "@/lib/cn";
import { ProgressRail } from "@/components/ui/ProgressRail";

export const WIZARD_STEPS = [
  { key: 1, label: "Bundle" },
  { key: 2, label: "Candidates" },
  { key: 3, label: "Judge pool" },
  { key: 4, label: "Review" },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]["key"];

/** Clickable visited-step stepper + ProgressRail (plans/09 §1.1). */
export function WizardStepper({
  step,
  maxReached,
  onStep,
}: {
  step: WizardStep;
  maxReached: WizardStep;
  onStep: (s: WizardStep) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Desktop stepper */}
      <ol className="hidden items-center gap-1 md:flex" aria-label="Run setup steps">
        {WIZARD_STEPS.map((s, i) => {
          const reached = s.key <= maxReached;
          const current = s.key === step;
          return (
            <li key={s.key} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden="true" className="mx-1 h-px w-6 bg-line-subtle" />
              )}
              <button
                type="button"
                disabled={!reached}
                onClick={() => reached && onStep(s.key)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors duration-150",
                  current && "bg-teal-900 text-teal-300",
                  !current && reached && "text-body hover:bg-ink-800 hover:text-bright",
                  !reached && "cursor-not-allowed text-faint",
                )}
              >
                <span className="font-mono text-xs tabular-nums">
                  {String.fromCharCode(0x2460 + s.key - 1)}
                </span>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {/* Mobile: "Step 2 of 4 — Candidates" */}
      <div className="md:hidden" aria-label="Run setup steps">
        <p className="text-sm text-body" data-testid={`step-heading-${step}`}>
          Step {step} of 4 — {WIZARD_STEPS[step - 1]!.label}
        </p>
      </div>

      <ProgressRail
        value={step}
        max={4}
        label={`Step ${step} of 4`}
        className="max-w-md"
      />
    </div>
  );
}
