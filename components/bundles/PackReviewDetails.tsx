import { Badge } from "@/components/ui/Badge";
import { CATEGORY_LABELS } from "@/lib/bundles/task-labels";
import type { PackReview } from "@/lib/bundles/pack-review";
import {
  PACK_FLAG_HINT,
  PACK_FLAG_LABEL,
  PACK_FLAG_PENALTY,
  packReviewSummary,
} from "@/lib/bundles/review-flags";

/** Mechanical pack-lint flags — this is not a model grade of the problems. */
export function PackReviewDetails({
  quality,
}: {
  quality: PackReview;
}) {
  return (
    <div
      className="rounded-md border border-line-subtle bg-ink-950 px-4 py-3"
      data-testid="pack-review-details"
    >
      <p className="text-xs uppercase tracking-wide text-dim">Why this score</p>
      <p className="mt-1 text-sm text-body">{packReviewSummary(quality)}</p>
      <p className="mt-1 text-xs text-faint">
        This is a checklist on the draft (length, must-mention leaks, footer).
        It is not a judge score of how hard the problems are.
      </p>
      {quality.flags.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {quality.flags.map((f, i) => {
            const penalty = PACK_FLAG_PENALTY[f.flag];
            return (
              <li
                key={`${f.category}-${f.flag}-${i}`}
                className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-body">
                    {CATEGORY_LABELS[f.category]}
                  </span>
                  <Badge tone={penalty > 0 ? "warn" : "neutral"}>
                    {PACK_FLAG_LABEL[f.flag]}
                    {penalty > 0 ? ` −${penalty}` : ""}
                  </Badge>
                </div>
                <span className="text-sm text-dim">{PACK_FLAG_HINT[f.flag]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
