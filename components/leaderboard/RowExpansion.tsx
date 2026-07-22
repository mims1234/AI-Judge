import Link from "next/link";
import { CategoryRadar } from "@/components/charts/CategoryRadar";
import { formatPercent, formatScore } from "@/lib/format";
import { CATEGORY_ORDER } from "@/lib/schemas";
import type { LeaderboardRow } from "@/lib/scoring";

export type RowExpansionProps = {
  row: LeaderboardRow;
  bundleSlug: string;
  demo?: boolean;
};

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

/** Expanded leaderboard row: radar + per-category table + links (plans/10 §2.2). */
export function RowExpansion({ row, bundleSlug, demo }: RowExpansionProps) {
  const values = CATEGORY_ORDER.map((c) => ({
    category: c,
    score: row.category_medians[c] ?? row.category_detail[c]?.median ?? null,
  }));

  const scored = values.filter((v) => v.score != null) as Array<{
    category: string;
    score: number;
  }>;
  const best = scored.reduce<(typeof scored)[number] | null>(
    (acc, v) => (!acc || v.score > acc.score ? v : acc),
    null,
  );
  const worst = scored.reduce<(typeof scored)[number] | null>(
    (acc, v) => (!acc || v.score < acc.score ? v : acc),
    null,
  );

  const compareHref = `/compare?bundle=${encodeURIComponent(bundleSlug)}&models=${encodeURIComponent(row.model_id)}${demo ? "&demo=1" : ""}`;

  return (
    <div className="grid gap-4 p-3 md:grid-cols-[260px_1fr]">
      <CategoryRadar
        categories={[...CATEGORY_ORDER]}
        series={[
          {
            label: modelShort(row.model_id),
            color: "teal",
            values,
          },
        ]}
        size={220}
        showLegend={false}
      />

      <div className="min-w-0">
        <table className="min-w-full border-collapse text-sm">
          <caption className="sr-only">
            Per-category scores for {row.model_id}
          </caption>
          <thead>
            <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-dim">
              <th scope="col" className="px-2 py-1.5 font-normal">Category</th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">Median</th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">Spread</th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">Validators</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.map((c) => {
              const d = row.category_detail[c];
              const isBest = best?.category === c;
              const isWorst = worst?.category === c;
              return (
                <tr key={c} className="border-b border-line-subtle last:border-b-0">
                  <th scope="row" className="px-2 py-1.5 text-left font-normal text-body">
                    {capitalize(c)}
                    {isBest && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-teal-400">
                        best
                      </span>
                    )}
                    {isWorst && !isBest && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-dim">
                        worst
                      </span>
                    )}
                  </th>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-bright">
                    {formatScore(d?.median ?? row.category_medians[c])}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-dim">
                    {formatScore(d?.spread)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-dim">
                    {formatPercent(d?.validator_pass_rate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link
            href={compareHref}
            className="text-teal-400 transition-colors duration-150 hover:text-teal-300"
          >
            Compare this model →
          </Link>
        </div>
      </div>
    </div>
  );
}
