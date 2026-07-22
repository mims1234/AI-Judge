import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { formatScore, formatRelativeTime } from "@/lib/format";
import type { LeaderboardRow } from "@/lib/scoring";

export type RankingPreviewProps = {
  bundleSlug: string;
  rows: LeaderboardRow[]; // top 5, already sliced
  unavailable?: boolean;
};

/** Live top-5 standings for the landing page (plans/08 §1.2). Server-rendered. */
export function RankingPreview({ bundleSlug, rows, unavailable = false }: RankingPreviewProps) {
  return (
    <section aria-labelledby="standings-heading" className="w-full">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="standings-heading" className="text-xl text-bright">
            Current standings
          </h2>
          <p className="mt-0.5 font-mono text-xs text-dim">{bundleSlug}</p>
        </div>
        <Link
          href="/leaderboard"
          className="text-sm text-teal-400 transition-colors duration-150 hover:text-teal-300"
        >
          Full leaderboard →
        </Link>
      </div>

      {unavailable ? (
        <EmptyState
          title="Standings unavailable"
          body="The leaderboard could not be read just now. It usually means the database is still warming up."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No completed runs yet."
          body="Rankings appear after the first complete bundle run."
          action={
            <Link href="/run" className={buttonClasses({ variant: "primary" })}>
              Start a benchmark
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-line-subtle bg-ink-900">
          <table className="min-w-full border-collapse">
            <caption className="sr-only">Top models on {bundleSlug}</caption>
            <thead>
              <tr className="border-b border-line-strong">
                <th scope="col" className="px-3 py-2 text-left text-xs font-normal uppercase tracking-wide text-dim">
                  Rank
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-normal uppercase tracking-wide text-dim">
                  Model
                </th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-normal uppercase tracking-wide text-dim">
                  Median
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right text-xs font-normal uppercase tracking-wide text-dim sm:table-cell">
                  Runs
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right text-xs font-normal uppercase tracking-wide text-dim md:table-cell">
                  Last evaluated
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.model_id}
                  className="rank-enter border-b border-line-subtle transition-colors duration-150 last:border-b-0 hover:bg-ink-800"
                  style={{ ["--rank-index" as string]: Math.min(i, 9) }}
                >
                  <td className="px-3 py-2.5 font-mono text-sm tabular-nums text-dim">
                    {row.provisional ? "—" : row.rank}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/leaderboard?bundle=${bundleSlug}`}
                        className="font-mono text-sm text-bright transition-colors duration-150 hover:text-teal-300"
                      >
                        {row.model_id}
                      </Link>
                      {row.provisional && (
                        <Badge tone="warn" title="Fewer than 3 complete runs — median shown">
                          PROVISIONAL
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ScoreBadge score={row.score} size="sm" />
                  </td>
                  <td className="hidden px-3 py-2.5 text-right font-mono text-sm tabular-nums text-body sm:table-cell">
                    {row.complete_runs}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right text-sm text-dim md:table-cell">
                    {formatRelativeTime(row.last_evaluated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-line-subtle px-3 py-2 text-xs text-faint">
            Median of complete bundle-run scores · provisional &lt; 3 complete runs · score{" "}
            {formatScore(rows[0]?.score ?? null)} leader
          </div>
        </div>
      )}
    </section>
  );
}
