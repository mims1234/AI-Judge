"use client";

import { useMemo, useState } from "react";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { Tabs } from "@/components/ui/Tabs";
import { formatScore } from "@/lib/format";
import type { CalibrationRow } from "@/lib/analytics/types";

export type CalibrationTableProps = {
  rows: CalibrationRow[];
};

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

/** Fixture × judge calibration results (plans/10 §4.2). */
export function CalibrationTable({ rows }: CalibrationTableProps) {
  const judges = useMemo(
    () => [...new Set(rows.map((r) => r.judge_model_id))],
    [rows],
  );
  const [active, setActive] = useState<string>(judges[0] ?? "all");

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-subtle px-3 py-4 text-sm text-dim">
        No calibration fixtures run yet. Fixtures are optional in v1.
      </p>
    );
  }

  const filtered =
    active === "all" ? rows : rows.filter((r) => r.judge_model_id === active);

  const means = judges.map((j) => {
    const subset = rows.filter((r) => r.judge_model_id === j);
    const vals = subset
      .map((r) => r.evidence_quality)
      .filter((v): v is number => v != null);
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { judge: j, mean };
  });

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        tabs={[
          { key: "all", label: "All" },
          ...judges.map((j) => ({ key: j, label: modelShort(j) })),
        ]}
        activeKey={active}
        onChange={setActive}
        ariaLabel="Filter calibration by judge"
      />

      <div className="overflow-x-auto rounded-md border border-line-subtle bg-ink-900">
        <table className="min-w-full border-collapse text-sm">
          <caption className="sr-only">Judge calibration fixture results</caption>
          <thead>
            <tr className="border-b border-line-strong text-xs uppercase tracking-wide text-dim">
              <th scope="col" className="px-3 py-2 text-left font-normal">Fixture</th>
              <th scope="col" className="px-3 py-2 text-left font-normal">Judge</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Evidence</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Consistency</th>
              <th scope="col" className="px-3 py-2 text-center font-normal">Correct</th>
              <th scope="col" className="px-3 py-2 text-left font-normal">Parse</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-line-subtle last:border-b-0">
                <th scope="row" className="px-3 py-2 text-left font-mono text-xs font-normal text-body">
                  {r.fixture}
                </th>
                <td className="px-3 py-2 text-body">{modelShort(r.judge_model_id)}</td>
                <td className="px-3 py-2 text-right">
                  <ScoreBadge score={r.evidence_quality} size="sm" />
                </td>
                <td className="px-3 py-2 text-right">
                  <ScoreBadge score={r.consistency} size="sm" />
                </td>
                <td className="px-3 py-2 text-center font-mono">
                  {r.correctness == null ? (
                    "—"
                  ) : r.correctness >= 1 ? (
                    <span className="text-pass-400">✓</span>
                  ) : (
                    <span className="text-fail-400">✕</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-xs text-dim">{r.parse_status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap gap-3 text-xs text-dim">
        <span className="uppercase tracking-wide">Per-judge evidence mean</span>
        {means.map((m) => (
          <span key={m.judge} className="font-mono tabular-nums">
            {modelShort(m.judge)} {formatScore(m.mean)}
          </span>
        ))}
      </footer>
    </div>
  );
}
