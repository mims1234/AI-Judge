"use client";

import { useMemo, useState } from "react";
import { MiniBar } from "@/components/charts/MiniBar";
import { JudgeRowExpansion } from "@/components/judges/JudgeRowExpansion";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatPercent, formatScore } from "@/lib/format";
import type { JudgeDetail, JudgeRollup } from "@/lib/analytics/types";

export type JudgeTableProps = {
  rollups: JudgeRollup[];
  details: Record<string, JudgeDetail>;
  panelSigma: number | null;
};

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function providerOf(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(0, slash);
}

/** Per-judge harshness / variance / parse / meta table (plans/10 §4.2). */
export function JudgeTable({ rollups, details, panelSigma }: JudgeTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const maxAbsOffset = useMemo(() => {
    const m = Math.max(...rollups.map((r) => Math.abs(r.harshness_offset)), 1.5);
    return m;
  }, [rollups]);

  const columns: Column<JudgeRollup>[] = [
    {
      key: "model",
      header: "Model",
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-bright">{modelShort(r.judge_model_id)}</span>
          <span className="font-mono text-[11px] text-dim">{providerOf(r.judge_model_id)}</span>
        </span>
      ),
    },
    {
      key: "judgments",
      header: "Judgments",
      mono: true,
      render: (r) => r.judgment_count,
    },
    {
      key: "harshness",
      header: "Harshness",
      render: (r) => {
        const offset = r.harshness_offset;
        const outlier = Math.abs(offset) > 1.5;
        // Diverging bar: map [-max, +max] → fill from center
        const normalized = (offset + maxAbsOffset) / (2 * maxAbsOffset);
        return (
          <div className="flex min-w-[140px] flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs tabular-nums text-body">
                {offset > 0 ? "+" : ""}
                {formatScore(offset)}
              </span>
              {outlier && <Badge tone="warn">outlier</Badge>}
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-sm bg-ink-700">
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-bright/40" />
              {offset < 0 ? (
                <div
                  className="absolute top-0 bottom-0 right-1/2 bg-warn-400"
                  style={{ width: `${(0.5 - normalized) * 100}%` }}
                />
              ) : (
                <div
                  className="absolute top-0 bottom-0 left-1/2 bg-info-400"
                  style={{ width: `${(normalized - 0.5) * 100}%` }}
                />
              )}
            </div>
            <span className="text-[10px] text-faint">
              {offset < 0 ? "harsh ←" : "→ lenient"}
            </span>
          </div>
        );
      },
    },
    {
      key: "variance",
      header: "Variance",
      mono: true,
      render: (r) => (
        <Tooltip
          content={
            panelSigma != null
              ? `Panel-wide σ ${formatScore(panelSigma)}`
              : "Panel-wide σ unavailable"
          }
        >
          <span className="font-mono text-sm tabular-nums">
            {formatScore(Math.sqrt(r.variance))}
          </span>
        </Tooltip>
      ),
    },
    {
      key: "parse",
      header: "Parse fails",
      render: (r) => {
        const detail = details[r.judge_model_id];
        const tip = detail
          ? `first-try ${detail.parseBreakdown.firstTry} · repaired ${detail.parseBreakdown.repaired} · invalid ${detail.parseBreakdown.invalid}`
          : `${formatPercent(r.parse_fail_rate)} not first-try`;
        return (
          <Tooltip content={tip}>
            <span className="inline-flex min-w-[100px]">
              <MiniBar
                value={r.parse_fail_rate}
                max={1}
                tone={r.parse_fail_rate > 0.1 ? "warn" : "dim"}
                label="parse fail rate"
                format={(v) => formatPercent(v)}
              />
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "evidence",
      header: "Evidence",
      render: (r) => <ScoreBadge score={r.mean_meta_score} size="sm" />,
    },
    {
      key: "mismatch",
      header: "Claim Δ",
      mono: true,
      render: (r) => formatScore(r.mean_claim_mismatch),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rollups}
      rowKey={(r) => r.judge_model_id}
      caption="Judge reliability rollups"
      stickyHeader
      expandable={{
        isExpanded: (r) => expanded === r.judge_model_id,
        onToggle: (r) =>
          setExpanded((cur) =>
            cur === r.judge_model_id ? null : r.judge_model_id,
          ),
        render: (r) => (
          <JudgeRowExpansion
            judgeModelId={r.judge_model_id}
            detail={
              details[r.judge_model_id] ?? {
                recentOveralls: [],
                flaggedJudgments: [],
                parseBreakdown: { firstTry: 0, repaired: 0, invalid: 0 },
              }
            }
          />
        ),
      }}
      rowTestId={(r) => `judge-row-${r.judge_model_id}`}
    />
  );
}
