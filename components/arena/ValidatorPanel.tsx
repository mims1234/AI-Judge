import { cn } from "@/lib/cn";
import { validatorLabel } from "@/lib/validatorLabels";
import type { ValidatorCheck } from "@/lib/client/runStore";
import { Badge } from "@/components/ui/Badge";

function isSkipped(c: ValidatorCheck): boolean {
  return c.skipped === true || c.details.startsWith("skipped:");
}

function isNote(c: ValidatorCheck): boolean {
  return c.informational === true || c.details.startsWith("note:");
}

function isCountable(c: ValidatorCheck): boolean {
  return !isSkipped(c) && !isNote(c);
}

/** Deterministic checks checklist (plans/09 §2.4). */
export function ValidatorPanel({
  checks,
  className,
}: {
  checks: ValidatorCheck[];
  className?: string;
}) {
  if (checks.length === 0) {
    return (
      <p className={cn("text-sm text-dim", className)}>No validator results yet.</p>
    );
  }

  const countable = checks.filter(isCountable);
  const passed = countable.filter((c) => c.passed).length;
  const skippedN = checks.filter(isSkipped).length;
  const notesN = checks.filter(isNote).length;

  const badgeTone =
    countable.length === 0
      ? "neutral"
      : passed === countable.length
        ? "pass"
        : "fail";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={badgeTone}>
          {countable.length === 0
            ? "No countable checks"
            : `${passed}/${countable.length} checks passed`}
        </Badge>
        {skippedN > 0 && (
          <Badge tone="neutral">{skippedN} skipped</Badge>
        )}
        {notesN > 0 && <Badge tone="info">{notesN} notes</Badge>}
      </div>
      <ul className="flex flex-col gap-1.5">
        {checks.map((c) => {
          const skipped = isSkipped(c);
          const note = isNote(c);
          return (
            <li
              key={c.validator}
              className={cn(
                "rounded-sm border px-3 py-2 text-sm",
                skipped
                  ? "border-line-subtle bg-ink-850 text-dim"
                  : note
                    ? "border-info-400/25 bg-ink-850 text-info-400"
                    : c.passed
                      ? "border-pass-400/20 bg-pass-900/40 text-pass-400"
                      : "border-fail-400/30 bg-fail-900 text-fail-400",
              )}
            >
              <div className="flex items-start gap-2">
                <span aria-hidden="true" className="font-mono">
                  {skipped ? "–" : note ? "ⓘ" : c.passed ? "✓" : "✕"}
                </span>
                <div className="min-w-0 flex-1">
                  <div>{validatorLabel(c.validator)}</div>
                  {(c.expected != null || c.actual != null) && !skipped && (
                    <div className="mt-0.5 font-mono text-xs opacity-80">
                      {c.expected != null && <span>expected {c.expected}</span>}
                      {c.expected != null && c.actual != null && <span> · </span>}
                      {c.actual != null && <span>got {c.actual}</span>}
                    </div>
                  )}
                  {c.details && (skipped || note || !c.passed) && (
                    <div className="mt-0.5 text-xs opacity-70">{c.details}</div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function validatorSummary(checks: ValidatorCheck[] | undefined): string | null {
  if (!checks || checks.length === 0) return null;
  const countable = checks.filter(isCountable);
  if (countable.length === 0) {
    const skippedN = checks.filter(isSkipped).length;
    return skippedN > 0 ? `${skippedN} skipped` : null;
  }
  const passed = countable.filter((c) => c.passed).length;
  return `${passed}/${countable.length} checks passed`;
}
