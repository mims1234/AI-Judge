"use client";

import { useState } from "react";
import { MiniBar } from "@/components/charts/MiniBar";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { formatTokens, formatUsd, formatUsdRange } from "@/lib/format";
import { CATEGORY_ORDER, type Category, type RunSnapshot } from "@/lib/schemas";

export type CostBreakdownProps = {
  snapshot: RunSnapshot;
};

type CostRow = {
  modelId: string;
  role: "candidate" | "judge";
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
};

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function rollup(snapshot: RunSnapshot, categoryFilter?: Category): CostRow[] {
  const map = new Map<string, CostRow>();

  const ensure = (id: string, role: "candidate" | "judge") => {
    const key = `${role}:${id}`;
    let row = map.get(key);
    if (!row) {
      row = {
        modelId: id,
        role,
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
      };
      map.set(key, row);
    }
    return row;
  };

  for (const tr of snapshot.task_results) {
    if (categoryFilter && tr.category !== categoryFilter) continue;
    const cand = ensure(tr.candidate_model_id, "candidate");
    cand.requests += 1;
    cand.promptTokens += tr.tokens?.prompt ?? 0;
    cand.completionTokens += tr.tokens?.completion ?? 0;
    cand.cost += tr.cost_usd ?? 0;

    for (const j of tr.judgments) {
      ensure(j.judge_model_id, "judge").requests += 1;
    }
  }

  return [...map.values()].sort((a, b) => b.cost - a.cost || b.requests - a.requests);
}

/** Cost rollup with category tabs + estimate footer (plans/10 §5.1). */
export function CostBreakdown({ snapshot }: CostBreakdownProps) {
  const [tab, setTab] = useState<string>("all");
  const rows = tab === "all" ? rollup(snapshot) : rollup(snapshot, tab as Category);
  const totalFromRows = rollup(snapshot).reduce((a, r) => a + r.cost, 0);
  const total = snapshot.run.total_cost_usd || totalFromRows;
  const maxShare = Math.max(...rows.map((r) => r.cost), 0.0001);

  const estimate =
    typeof snapshot.run.parameters?.preflight_cost_expected === "number"
      ? {
          min: Number(snapshot.run.parameters.preflight_cost_min ?? 0),
          expected: Number(snapshot.run.parameters.preflight_cost_expected),
          max: Number(snapshot.run.parameters.preflight_cost_max ?? 0),
        }
      : null;

  return (
    <section aria-labelledby="cost-heading" className="flex flex-col gap-3">
      <h2 id="cost-heading" className="text-sm uppercase tracking-wide text-dim">
        Cost breakdown
      </h2>

      <Tabs
        tabs={[
          { key: "all", label: "All" },
          ...CATEGORY_ORDER.map((c) => ({ key: c, label: capitalize(c) })),
        ]}
        activeKey={tab}
        onChange={setTab}
        ariaLabel="Cost by category"
      />

      <div className="overflow-x-auto rounded-md border border-line-subtle bg-ink-900">
        <table className="min-w-full border-collapse text-sm">
          <caption className="sr-only">Cost breakdown by model</caption>
          <thead>
            <tr className="border-b border-line-strong text-xs uppercase tracking-wide text-dim">
              <th scope="col" className="px-3 py-2 text-left font-normal">Model</th>
              <th scope="col" className="px-3 py-2 text-left font-normal">Role</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Requests</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Tokens in</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Tokens out</th>
              <th scope="col" className="px-3 py-2 text-left font-normal">Cost</th>
              <th scope="col" className="px-3 py-2 text-left font-normal">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-dim">
                  No billed requests in this slice.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={`${r.role}:${r.modelId}`}
                  className="border-b border-line-subtle last:border-b-0"
                >
                  <th scope="row" className="px-3 py-2 text-left font-normal text-bright">
                    {modelShort(r.modelId)}
                  </th>
                  <td className="px-3 py-2">
                    <Badge tone={r.role === "candidate" ? "teal" : "info"}>
                      {r.role === "candidate" ? "CANDIDATE" : "JUDGE"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {r.requests}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-dim">
                    {formatTokens(r.promptTokens)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-dim">
                    {formatTokens(r.completionTokens)}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums">
                    {r.cost > 0 ? formatUsd(r.cost) : "—"}
                  </td>
                  <td className="min-w-[120px] px-3 py-2">
                    <MiniBar
                      value={r.cost}
                      max={maxShare}
                      tone="teal"
                      label="share of total"
                      format={(v) =>
                        total > 0 ? `${((v / total) * 100).toFixed(0)}%` : "—"
                      }
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-dim">
        <span>
          Actual{" "}
          <span className="font-mono tabular-nums text-bright">{formatUsd(total)}</span>
        </span>
        {estimate && (
          <span>
            Preflight{" "}
            <span className="font-mono tabular-nums">
              {formatUsdRange(estimate.min, estimate.max)}
            </span>
            <span className="ml-1 text-faint">
              (expected {formatUsd(estimate.expected)})
            </span>
          </span>
        )}
        {snapshot.run.budget_usd != null && (
          <span>
            Cap{" "}
            <span className="font-mono tabular-nums">
              {formatUsd(snapshot.run.budget_usd)}
            </span>
          </span>
        )}
      </footer>
    </section>
  );
}
