"use client";

import { cn } from "@/lib/cn";
import { formatScore, formatTokens, scoreBand } from "@/lib/format";
import type { Category, TaskResultStatus } from "@/lib/schemas";
import type { CellState } from "@/lib/client/runStore";
import { useCellTokenTick } from "@/lib/client/useRunStream";
import { DisagreementFlag } from "@/components/ui/DisagreementFlag";
import { StatusDot } from "@/components/ui/StatusDot";

export type ArenaCellProps = {
  cell: CellState | undefined;
  candidateModelId: string;
  category: Category;
  runTerminal: boolean;
  focused: boolean;
  onSelect: () => void;
  onFocus: () => void;
  tabIndex: number;
};

function pickTrial(cell: CellState | undefined) {
  if (!cell || cell.trials.size === 0) return null;
  // Prefer lowest trial index for display; medianAcrossTrials for score
  const indices = [...cell.trials.keys()].sort((a, b) => a - b);
  return cell.trials.get(indices[0]!) ?? null;
}

function statusOf(cell: CellState | undefined): TaskResultStatus | "empty" {
  if (!cell || cell.trials.size === 0) return "empty";
  // Aggregate: if any streaming/judging prefer that; else if all scored; else worst
  const statuses = [...cell.trials.values()].map((t) => t.status);
  if (statuses.some((s) => s === "streaming")) return "streaming";
  if (statuses.some((s) => s === "judging")) return "judging";
  if (statuses.some((s) => s === "validating")) return "validating";
  if (statuses.some((s) => s === "error")) return "error";
  if (statuses.every((s) => s === "scored")) return "scored";
  return statuses[0] ?? "pending";
}

/** Single arena matrix cell (plans/09 §2.3). */
export function ArenaCell({
  cell,
  candidateModelId,
  category,
  runTerminal,
  focused,
  onSelect,
  onFocus,
  tabIndex,
}: ArenaCellProps) {
  const trial = pickTrial(cell);
  const status = statusOf(cell);
  const tokens = useCellTokenTick(status === "streaming" ? (trial?.taskResultId ?? null) : null);
  const score = cell?.medianAcrossTrials ?? trial?.median ?? null;
  const spread = trial?.spread ?? 0;
  const flagged = !!trial?.flagged || spread > 3;
  const unfinishedTerminal =
    runTerminal && (status === "pending" || status === "empty" || status === "streaming");

  const band = score != null ? scoreBand(score) : null;

  let aria = `${candidateModelId}, ${category}: `;
  if (unfinishedTerminal) aria += "unfinished";
  else if (status === "scored" && score != null) {
    aria += `scored ${formatScore(score)} out of 10`;
    if (flagged) aria += `, judges disagreed`;
  } else if (status === "error") aria += "error";
  else aria += status;

  return (
    <div
      role="gridcell"
      tabIndex={tabIndex}
      data-testid={`cell-${candidateModelId}-${category}`}
      aria-label={aria}
      onFocus={onFocus}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "relative flex h-16 w-24 flex-col items-center justify-center rounded-sm border text-center outline-none transition-shadow duration-150",
        focused && "ring-1 ring-teal-400",
        unfinishedTerminal && "border-line-subtle bg-ink-900 text-faint line-through",
        !unfinishedTerminal && status === "pending" && "border-dashed border-line-subtle bg-ink-900 text-faint",
        !unfinishedTerminal && status === "empty" && "border-dashed border-line-subtle bg-ink-900 text-faint",
        status === "streaming" && "border-teal-400 bg-ink-900 cell-flash",
        status === "validating" && "border-line-subtle border-t-info-400 bg-ink-900",
        status === "judging" && "border-line-subtle border-t-warn-400 bg-ink-900",
        status === "scored" && !flagged && band && cn("border-line-subtle", band.bg),
        status === "scored" && flagged && "border-warn-400 bg-ink-900",
        status === "error" && "border-fail-400/40 bg-fail-900",
      )}
    >
      {flagged && status === "scored" && (
        <span className="absolute right-1 top-1">
          <DisagreementFlag spread={spread} compact />
        </span>
      )}

      {unfinishedTerminal && <span className="font-mono text-sm">—</span>}

      {!unfinishedTerminal && status === "pending" && (
        <span className="text-faint">·</span>
      )}
      {!unfinishedTerminal && status === "empty" && (
        <span className="text-faint">·</span>
      )}

      {status === "streaming" && (
        <>
          <span className="font-mono text-xs tabular-nums text-teal-300">
            ~{formatTokens(tokens || trial?.answer.tokens || 0)} tok
          </span>
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
          >
            <span className="block h-full w-full animate-pulse bg-teal-400/60" />
          </span>
        </>
      )}

      {status === "validating" && (
        <span className="text-xs text-info-400">checks…</span>
      )}

      {status === "judging" && (
        <div className="flex items-center gap-1">
          {Array.from({ length: 3 }, (_, i) => {
            const judges = trial ? [...trial.judges.values()] : [];
            const done = judges[i]?.verdict != null;
            return (
              <StatusDot
                key={i}
                tone={done ? "done" : judges[i]?.started ? "streaming" : "idle"}
              />
            );
          })}
        </div>
      )}

      {status === "scored" && score != null && !unfinishedTerminal && (
        <>
          <span
            className={cn(
              "font-mono text-lg tabular-nums score-pop",
              band?.text ?? "text-bright",
            )}
          >
            {formatScore(score)}
          </span>
          {cell && cell.trials.size > 1 && (
            <span className="font-mono text-[10px] text-dim">×{cell.trials.size}</span>
          )}
        </>
      )}

      {status === "error" && !unfinishedTerminal && (
        <span className="font-mono text-sm text-fail-400">✕</span>
      )}
    </div>
  );
}
