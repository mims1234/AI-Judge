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

const NUMERIC_COL = "w-[1%] whitespace-nowrap";

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function providerOf(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(0, slash);
}

function fallbackDetail(): JudgeDetail {
  return {
    recentOveralls: [],
    flaggedJudgments: [],
    parseBreakdown: { firstTry: 0, repaired: 0, invalid: 0 },
  };
}

function HarshnessMeter({
  offset,
  maxAbsOffset,
}: {
  offset: number;
  maxAbsOffset: number;
}) {
  const outlier = Math.abs(offset) > 1.5;
  const normalized = (offset + maxAbsOffset) / (2 * maxAbsOffset);
  const signed = `${offset > 0 ? "+" : ""}${formatScore(offset)}`;
  return (
    <Tooltip
      content={
        offset < 0
          ? `${signed} vs panel median — harsh`
          : offset > 0
            ? `${signed} vs panel median — lenient`
            : "In line with the panel median"
      }
    >
      <div className="flex min-w-[9.5rem] flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-body">
            {signed}
          </span>
          <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-ink-700">
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
        </div>
        {outlier && (
          <span className="pl-10">
            <Badge tone="warn">outlier</Badge>
          </span>
        )}
      </div>
    </Tooltip>
  );
}

function ParseFailCell({
  rollup,
  detail,
}: {
  rollup: JudgeRollup;
  detail: JudgeDetail | undefined;
}) {
  const tip = detail
    ? `first-try ${detail.parseBreakdown.firstTry} · repaired ${detail.parseBreakdown.repaired} · invalid ${detail.parseBreakdown.invalid}`
    : `${formatPercent(rollup.parse_fail_rate)} not first-try`;
  return (
    <Tooltip content={tip}>
      <span className="inline-flex w-[7.5rem]">
        <MiniBar
          value={rollup.parse_fail_rate}
          max={1}
          tone={rollup.parse_fail_rate > 0.1 ? "warn" : "dim"}
          label="parse fail rate"
          format={(v) => formatPercent(v)}
        />
      </span>
    </Tooltip>
  );
}

function VarianceCell({
  rollup,
  panelSigma,
}: {
  rollup: JudgeRollup;
  panelSigma: number | null;
}) {
  return (
    <Tooltip
      content={
        panelSigma != null
          ? `Panel-wide σ ${formatScore(panelSigma)}`
          : "Panel-wide σ unavailable"
      }
    >
      <span className="font-mono text-sm tabular-nums">
        {formatScore(Math.sqrt(rollup.variance))}
      </span>
    </Tooltip>
  );
}

function Expansion({
  rollup,
  detail,
}: {
  rollup: JudgeRollup;
  detail: JudgeDetail | undefined;
}) {
  return (
    <JudgeRowExpansion
      judgeModelId={rollup.judge_model_id}
      detail={detail ?? fallbackDetail()}
    />
  );
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
      className: "w-full min-w-[10rem]",
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
      className: NUMERIC_COL,
      render: (r) => r.judgment_count,
    },
    {
      key: "harshness",
      header: "Harshness",
      className: "w-[12rem]",
      render: (r) => (
        <HarshnessMeter offset={r.harshness_offset} maxAbsOffset={maxAbsOffset} />
      ),
    },
    {
      key: "variance",
      header: "Variance",
      mono: true,
      className: NUMERIC_COL,
      render: (r) => <VarianceCell rollup={r} panelSigma={panelSigma} />,
    },
    {
      key: "parse",
      header: "Parse fails",
      className: "w-[9rem]",
      render: (r) => (
        <ParseFailCell rollup={r} detail={details[r.judge_model_id]} />
      ),
    },
    {
      key: "evidence",
      header: "Evidence",
      align: "right",
      className: NUMERIC_COL,
      render: (r) => <ScoreBadge score={r.mean_meta_score} size="sm" />,
    },
    {
      key: "mismatch",
      header: "Claim Δ",
      mono: true,
      className: NUMERIC_COL,
      render: (r) => formatScore(r.mean_claim_mismatch),
    },
  ];

  return (
    <>
      <div className="space-y-2 md:hidden">
        {rollups.map((r) => {
          const open = expanded === r.judge_model_id;
          return (
            <article
              key={r.judge_model_id}
              className="rounded-md border border-line-subtle bg-ink-900"
              data-testid={`judge-card-${r.judge_model_id}`}
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-3 text-left"
                aria-expanded={open}
                onClick={() =>
                  setExpanded(open ? null : r.judge_model_id)
                }
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  aria-hidden="true"
                  className={`shrink-0 text-dim transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                >
                  <path
                    d="M3.5 2l3 3-3 3"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-bright">
                    {modelShort(r.judge_model_id)}
                  </span>
                  <span className="font-mono text-[11px] text-dim">
                    {providerOf(r.judge_model_id)} · {r.judgment_count}{" "}
                    {r.judgment_count === 1 ? "judgment" : "judgments"}
                  </span>
                </span>
                <ScoreBadge score={r.mean_meta_score} size="sm" />
              </button>

              <dl className="grid grid-cols-3 gap-x-3 gap-y-3 border-t border-line-subtle px-3 py-3">
                <div className="col-span-3">
                  <dt className="mb-1 text-[10px] uppercase tracking-wide text-dim">
                    Harshness
                  </dt>
                  <dd>
                    <HarshnessMeter
                      offset={r.harshness_offset}
                      maxAbsOffset={maxAbsOffset}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-[10px] uppercase tracking-wide text-dim">
                    Parse fails
                  </dt>
                  <dd>
                    <Tooltip
                      content={
                        details[r.judge_model_id]
                          ? `first-try ${details[r.judge_model_id]!.parseBreakdown.firstTry} · repaired ${details[r.judge_model_id]!.parseBreakdown.repaired} · invalid ${details[r.judge_model_id]!.parseBreakdown.invalid}`
                          : `${formatPercent(r.parse_fail_rate)} not first-try`
                      }
                    >
                      <span
                        className={
                          r.parse_fail_rate > 0.1
                            ? "font-mono text-sm tabular-nums text-warn-400"
                            : "font-mono text-sm tabular-nums"
                        }
                      >
                        {formatPercent(r.parse_fail_rate)}
                      </span>
                    </Tooltip>
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-[10px] uppercase tracking-wide text-dim">
                    Variance
                  </dt>
                  <dd>
                    <VarianceCell rollup={r} panelSigma={panelSigma} />
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-[10px] uppercase tracking-wide text-dim">
                    Claim Δ
                  </dt>
                  <dd className="font-mono text-sm tabular-nums">
                    {formatScore(r.mean_claim_mismatch)}
                  </dd>
                </div>
              </dl>

              {open && (
                <div className="border-t border-line-subtle px-3 py-3">
                  <Expansion rollup={r} detail={details[r.judge_model_id]} />
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="hidden md:block">
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
              <Expansion rollup={r} detail={details[r.judge_model_id]} />
            ),
          }}
          rowTestId={(r) => `judge-row-${r.judge_model_id}`}
        />
      </div>
    </>
  );
}
