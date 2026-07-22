import { cn } from "@/lib/cn";
import { validatorLabel } from "@/lib/validatorLabels";
import type { ValidatorCheck } from "@/lib/client/runStore";
import { Badge } from "@/components/ui/Badge";

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

  const passed = checks.filter((c) => c.passed).length;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Badge tone={passed === checks.length ? "pass" : "fail"}>
        {passed}/{checks.length} checks passed
      </Badge>
      <ul className="flex flex-col gap-1.5">
        {checks.map((c) => (
          <li
            key={c.validator}
            className={cn(
              "rounded-sm border px-3 py-2 text-sm",
              c.passed
                ? "border-pass-400/20 bg-pass-900/40 text-pass-400"
                : "border-fail-400/30 bg-fail-900 text-fail-400",
            )}
          >
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="font-mono">
                {c.passed ? "✓" : "✕"}
              </span>
              <div className="min-w-0 flex-1">
                <div>{validatorLabel(c.validator)}</div>
                {(c.expected != null || c.actual != null) && (
                  <div className="mt-0.5 font-mono text-xs opacity-80">
                    {c.expected != null && <span>expected {c.expected}</span>}
                    {c.expected != null && c.actual != null && <span> · </span>}
                    {c.actual != null && <span>got {c.actual}</span>}
                  </div>
                )}
                {c.details && !c.passed && (
                  <div className="mt-0.5 text-xs opacity-70">{c.details}</div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function validatorSummary(checks: ValidatorCheck[] | undefined): string | null {
  if (!checks || checks.length === 0) return null;
  const passed = checks.filter((c) => c.passed).length;
  return `${passed}/${checks.length} checks passed`;
}
