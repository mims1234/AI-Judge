import { ScoreDistributionStrip } from "@/components/charts/ScoreDistributionStrip";
import { Badge } from "@/components/ui/Badge";
import { formatRelativeTime, formatScore } from "@/lib/format";
import type { JudgeDetail } from "@/lib/server/analytics";

export type JudgeRowExpansionProps = {
  detail: JudgeDetail;
  judgeModelId: string;
};

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** Last-20 overalls strip + flagged judgments (plans/10 §4.1). */
export function JudgeRowExpansion({ detail, judgeModelId }: JudgeRowExpansionProps) {
  const marks = detail.recentOveralls.map((r, i) => ({
    value: r.overall,
    label: `#${i + 1} overall`,
    tone: "teal" as const,
  }));
  const panelMarks = detail.recentOveralls.map((r, i) => ({
    value: r.panelMedian,
    label: `#${i + 1} panel median`,
    tone: "warn" as const,
  }));

  const { firstTry, repaired, invalid } = detail.parseBreakdown;
  const total = firstTry + repaired + invalid || 1;

  return (
    <div className="flex flex-col gap-4 p-1">
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-dim">
          Last {detail.recentOveralls.length} overalls vs panel median
        </p>
        <div className="flex flex-col gap-2">
          <ScoreDistributionStrip
            marks={marks}
            width={320}
            ariaLabel={`Recent overalls for ${modelShort(judgeModelId)}`}
          />
          <ScoreDistributionStrip
            marks={panelMarks}
            width={320}
            ariaLabel={`Panel medians alongside ${modelShort(judgeModelId)}`}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-dim">
        <Badge tone="pass">first-try {firstTry}</Badge>
        <Badge tone="warn">repaired {repaired}</Badge>
        <Badge tone="fail">invalid {invalid}</Badge>
        <span className="font-mono tabular-nums">
          {(((repaired + invalid) / total) * 100).toFixed(0)}% not first-try
        </span>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-dim">
          Recent flagged judgments (spread &gt; 3)
        </p>
        {detail.flaggedJudgments.length === 0 ? (
          <p className="text-sm text-dim">No flagged judgments in the recent window.</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.flaggedJudgments.map((f) => (
              <li
                key={f.taskResultId}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-sm border border-line-subtle px-2 py-1.5 text-sm"
              >
                <span className="text-body">{capitalize(f.category)}</span>
                <span className="font-mono text-xs text-dim">{modelShort(f.candidate)}</span>
                <span className="font-mono text-xs tabular-nums text-warn-400">
                  spread {formatScore(f.spread)}
                </span>
                <span className="font-mono text-xs tabular-nums text-dim">
                  med {formatScore(f.median)}
                </span>
                <span className="font-mono text-[11px] text-faint">
                  {formatRelativeTime(f.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
