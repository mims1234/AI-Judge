import { MiniBar } from "@/components/charts/MiniBar";
import {
  formatLatency,
  formatPercent,
  formatScore,
  formatUsd,
} from "@/lib/format";
import type { LeaderboardRow } from "@/lib/scoring";
import type { ModelRunStats } from "@/lib/analytics/types";

export type ReliabilityEconomicsProps = {
  rows: LeaderboardRow[];
  stats: Record<string, ModelRunStats>;
};

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function scorePerDollar(median: number | null, cost: number): number | null {
  if (median == null || cost <= 0) return null;
  return median / cost;
}

/** Runs / IQR / cost / score-per-dollar table (plans/10 §3.1). */
export function ReliabilityEconomics({ rows, stats }: ReliabilityEconomicsProps) {
  if (rows.length === 0) return null;

  const costs = rows.map((r) => r.avg_cost_usd_per_run);
  const latencies = rows.map((r) => r.avg_latency_ms);
  const spds = rows.map((r) =>
    scorePerDollar(stats[r.model_id]?.medianScore ?? r.score, r.avg_cost_usd_per_run) ?? 0,
  );
  const maxCost = Math.max(...costs, 0.0001);
  const maxLat = Math.max(...latencies, 1);
  const maxSpd = Math.max(...spds, 0.0001);

  return (
    <section aria-labelledby="reliability-heading" className="flex flex-col gap-3">
      <h2 id="reliability-heading" className="text-sm uppercase tracking-wide text-dim">
        Reliability &amp; economics
      </h2>
      <div className="overflow-x-auto rounded-md border border-line-subtle bg-ink-900">
        <table className="min-w-full border-collapse text-sm">
          <caption className="sr-only">
            Reliability and cost comparison across selected models
          </caption>
          <thead>
            <tr className="border-b border-line-strong text-xs uppercase tracking-wide text-dim">
              <th scope="col" className="px-3 py-2 text-left font-normal">Model</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Runs</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Incomplete</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Success</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Median / IQR</th>
              <th scope="col" className="px-3 py-2 text-left font-normal">Cost / run</th>
              <th scope="col" className="px-3 py-2 text-left font-normal">Latency</th>
              <th scope="col" className="px-3 py-2 text-left font-normal">Score / $</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = stats[r.model_id];
              const spd = scorePerDollar(st?.medianScore ?? r.score, r.avg_cost_usd_per_run);
              return (
                <tr key={r.model_id} className="border-b border-line-subtle last:border-b-0">
                  <th scope="row" className="px-3 py-3 text-left font-normal text-bright">
                    {modelShort(r.model_id)}
                  </th>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {st?.completeRuns ?? r.complete_runs}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-dim">
                    {st?.incompleteRuns ?? 0}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {formatPercent(r.success_rate)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-dim">
                    {formatScore(st?.medianScore ?? r.score)}
                    {st?.q1 != null && st.q3 != null && (
                      <span className="ml-1 text-faint">
                        ({formatScore(st.q1)}–{formatScore(st.q3)})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 min-w-[120px]">
                    <MiniBar
                      value={r.avg_cost_usd_per_run}
                      max={maxCost}
                      tone="warn"
                      label="cost"
                      format={formatUsd}
                    />
                  </td>
                  <td className="px-3 py-3 min-w-[120px]">
                    <MiniBar
                      value={r.avg_latency_ms}
                      max={maxLat}
                      tone="info"
                      label="latency"
                      format={formatLatency}
                    />
                  </td>
                  <td className="px-3 py-3 min-w-[120px]">
                    <MiniBar
                      value={spd ?? 0}
                      max={maxSpd}
                      tone="teal"
                      label="score per dollar"
                      format={(v) => (spd == null ? "—" : `${v.toFixed(1)} pts/$`)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
