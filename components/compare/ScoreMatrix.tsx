"use client";

import { ScoreDistributionStrip } from "@/components/charts/ScoreDistributionStrip";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { cn } from "@/lib/cn";
import { formatScore } from "@/lib/format";
import { CATEGORY_ORDER } from "@/lib/schemas";
import type { LeaderboardRow } from "@/lib/scoring";

export type ScoreMatrixProps = {
  rows: LeaderboardRow[];
};

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function stripMarks(median: number, spread: number) {
  const lo = Math.max(0, median - spread / 2);
  const hi = Math.min(10, median + spread / 2);
  return [
    { value: lo, label: "panel low", tone: "dim" as const },
    { value: median, label: "median", tone: "teal" as const },
    { value: hi, label: "panel high", tone: "dim" as const },
  ].map((m) => ({
    value: m.value,
    label: m.label,
    tone: (m.tone === "dim" ? "warn" : m.tone) as "teal" | "warn",
  }));
}

/** Category × model score matrix with best-in-row highlight (plans/10 §3.1). */
export function ScoreMatrix({ rows }: ScoreMatrixProps) {
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="score-matrix-heading" className="flex flex-col gap-3">
      <h2 id="score-matrix-heading" className="text-sm uppercase tracking-wide text-dim">
        Score matrix
      </h2>
      <div className="overflow-x-auto rounded-md border border-line-subtle bg-ink-900">
        <table
          className="min-w-full border-collapse"
          aria-describedby="score-matrix-heading"
        >
          <caption className="sr-only">
            Per-category median scores for selected models. Best-in-row cells are highlighted.
          </caption>
          <thead>
            <tr className="border-b border-line-strong">
              <th
                scope="col"
                className="sticky left-0 bg-ink-900 px-3 py-2 text-left text-xs font-normal uppercase tracking-wide text-dim"
              >
                Category
              </th>
              {rows.map((r) => (
                <th
                  key={r.model_id}
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-normal text-dim"
                >
                  <span className="text-body">{modelShort(r.model_id)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.map((cat) => {
              const scores = rows.map((r) => r.category_medians[cat] ?? null);
              const numeric = scores.filter((s): s is number => s != null);
              const best = numeric.length ? Math.max(...numeric) : null;

              return (
                <tr key={cat} className="border-b border-line-subtle last:border-b-0">
                  <th
                    scope="row"
                    className="sticky left-0 bg-ink-900 px-3 py-3 text-left text-sm font-normal text-body"
                  >
                    {capitalize(cat)}
                  </th>
                  {rows.map((r) => {
                    const d = r.category_detail[cat];
                    const median = r.category_medians[cat] ?? d?.median ?? null;
                    const spread = d?.spread ?? 0;
                    const isBest = median != null && best != null && median === best;
                    return (
                      <td key={r.model_id} className="px-3 py-3 align-top">
                        <div
                          className={cn(
                            "inline-flex flex-col gap-1.5 rounded-md p-1",
                            isBest && "ring-1 ring-teal-400",
                          )}
                        >
                          <div className="flex items-baseline gap-2">
                            <ScoreBadge score={median} size="sm" />
                            <span className="font-mono text-[11px] tabular-nums text-dim">
                              ±{formatScore(spread)}
                            </span>
                          </div>
                          {median != null && (
                            <ScoreDistributionStrip
                              marks={stripMarks(median, spread)}
                              median={median}
                              width={120}
                              ariaLabel={`${capitalize(cat)} panel spread for ${modelShort(r.model_id)}`}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
