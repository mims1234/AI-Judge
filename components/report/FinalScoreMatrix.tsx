"use client";

import { CategoryRadar } from "@/components/charts/CategoryRadar";
import { DisagreementFlag } from "@/components/ui/DisagreementFlag";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { formatScore } from "@/lib/format";
import { CATEGORY_ORDER, type Category, type RunSnapshot } from "@/lib/schemas";

export type FinalScoreMatrixProps = {
  snapshot: RunSnapshot;
  onOpenCell?: (candidate: string, category: Category) => void;
};

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

type CellAgg = { median: number | null; spread: number; flagged: boolean };

function aggregateCells(snapshot: RunSnapshot): Map<string, CellAgg> {
  const map = new Map<string, CellAgg>();
  for (const cand of snapshot.candidates) {
    for (const cat of CATEGORY_ORDER) {
      const trials = snapshot.task_results.filter(
        (t) => t.candidate_model_id === cand && t.category === cat && t.aggregate,
      );
      if (trials.length === 0) {
        map.set(`${cand}:${cat}`, { median: null, spread: 0, flagged: false });
        continue;
      }
      const medians = trials.map((t) => t.aggregate!.median_overall);
      const spreads = trials.map((t) => t.aggregate!.disagreement);
      const median =
        medians.slice().sort((a, b) => a - b)[Math.floor(medians.length / 2)] ?? null;
      const spread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
      map.set(`${cand}:${cat}`, {
        median,
        spread,
        flagged: trials.some((t) => t.aggregate!.flagged) || spread > 3,
      });
    }
  }
  return map;
}

function macroAverage(cells: Map<string, CellAgg>, candidate: string): number | null {
  const vals = CATEGORY_ORDER.map(
    (c) => cells.get(`${candidate}:${c}`)?.median ?? null,
  ).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Candidates × categories score matrix + per-candidate radars (plans/10 §5.1). */
export function FinalScoreMatrix({ snapshot, onOpenCell }: FinalScoreMatrixProps) {
  const cells = aggregateCells(snapshot);

  return (
    <section aria-labelledby="final-scores-heading" className="flex flex-col gap-4">
      <h2 id="final-scores-heading" className="text-sm uppercase tracking-wide text-dim">
        Final scores
      </h2>

      <div className="overflow-x-auto rounded-md border border-line-subtle bg-ink-900">
        <table className="min-w-full border-collapse text-sm">
          <caption className="sr-only">
            Final median scores by candidate and category. TOTAL is the equal-weight macro-average.
          </caption>
          <thead>
            <tr className="border-b border-line-strong text-xs uppercase tracking-wide text-dim">
              <th scope="col" className="px-3 py-2 text-left font-normal">
                Candidate
              </th>
              {CATEGORY_ORDER.map((c) => (
                <th key={c} scope="col" className="px-2 py-2 text-center font-normal">
                  {capitalize(c).slice(0, 4)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-center font-normal text-teal-400">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {snapshot.candidates.map((cand) => {
              const total = macroAverage(cells, cand);
              return (
                <tr key={cand} className="border-b border-line-subtle last:border-b-0">
                  <th
                    scope="row"
                    className="px-3 py-2 text-left font-normal text-bright"
                  >
                    {modelShort(cand)}
                  </th>
                  {CATEGORY_ORDER.map((cat) => {
                    const cell = cells.get(`${cand}:${cat}`)!;
                    return (
                      <td key={cat} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          disabled={!onOpenCell || cell.median == null}
                          onClick={() => onOpenCell?.(cand, cat)}
                          className="inline-flex flex-col items-center gap-0.5 rounded-sm px-1 py-0.5 transition-colors duration-150 hover:bg-ink-800 disabled:cursor-default disabled:hover:bg-transparent"
                          title={
                            cell.median == null
                              ? undefined
                              : `Open ${capitalize(cat)} in Arena`
                          }
                        >
                          <ScoreBadge score={cell.median} size="sm" />
                          {cell.median != null && (
                            <span className="font-mono text-[10px] tabular-nums text-dim">
                              ±{formatScore(cell.spread)}
                            </span>
                          )}
                          {cell.flagged && <DisagreementFlag spread={cell.spread} compact />}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    <ScoreBadge score={total} size="sm" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {snapshot.candidates.map((cand) => {
          const values = CATEGORY_ORDER.map((c) => ({
            category: c,
            score: cells.get(`${cand}:${c}`)?.median ?? null,
          }));
          return (
            <div
              key={cand}
              className="flex flex-col items-center gap-2 rounded-md border border-line-subtle bg-ink-900 p-3"
            >
              <div className="text-sm text-bright">{modelShort(cand)}</div>
              <CategoryRadar
                categories={[...CATEGORY_ORDER]}
                series={[{ label: modelShort(cand), color: "teal", values }]}
                size={180}
                showLegend={false}
              />
              <table className="w-full text-xs">
                <caption className="sr-only">
                  Category scores for {modelShort(cand)}
                </caption>
                <tbody>
                  {values.map((v) => (
                    <tr key={v.category}>
                      <th scope="row" className="py-0.5 text-left font-normal text-dim">
                        {capitalize(v.category)}
                      </th>
                      <td className="py-0.5 text-right font-mono tabular-nums">
                        {formatScore(v.score)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
