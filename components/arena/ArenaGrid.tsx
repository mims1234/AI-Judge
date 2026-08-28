"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { labeledTaskTitles } from "@/lib/bundles/task-labels";
import { buildCellHref, isCategory } from "@/lib/cellRef";
import { cn } from "@/lib/cn";
import { formatScore } from "@/lib/format";
import { CATEGORY_ORDER, type Category } from "@/lib/schemas";
import { cellKey, isTerminal } from "@/lib/client/runStore";
import { useRunStore } from "@/lib/client/useRunStream";
import { ArenaCell } from "@/components/arena/ArenaCell";
import { Tooltip } from "@/components/ui/Tooltip";

const CAT_SHORT: Record<Category, string> = {
  roleplay: "Roleplay",
  coding: "Coding",
  math: "Math",
  research: "Research",
  marketing: "Mktg",
  poster: "Poster",
  story: "Story",
  judging: "Judging",
  general: "General",
  other: "Other",
};

type ArenaColumn = { taskId: string; category: Category; label: string };

function columnsFromRun(
  parameters: Record<string, unknown>,
  cells: Iterable<{ taskId: string; category: Category }>,
): ArenaColumn[] {
  const selected = Array.isArray(parameters.categories)
    ? (parameters.categories as unknown[]).filter(
        (c): c is Category => typeof c === "string" && isCategory(c),
      )
    : null;
  const raw = parameters.tasks;
  if (Array.isArray(raw) && raw.length > 0) {
    const tasks: Array<{ id: string; category: Category }> = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const rec = item as { id?: unknown; category?: unknown };
      if (typeof rec.id !== "string" || typeof rec.category !== "string") continue;
      if (!isCategory(rec.category)) continue;
      if (selected && !selected.includes(rec.category)) continue;
      tasks.push({ id: rec.id, category: rec.category });
    }
    if (tasks.length > 0) {
      return labeledTaskTitles(tasks).map((t) => ({
        taskId: t.id,
        category: t.category,
        label: t.title,
      }));
    }
  }
  const byTask = new Map<string, Category>();
  for (const cell of cells) {
    if (cell.taskId) byTask.set(cell.taskId, cell.category);
  }
  const inferred = [...byTask.entries()].map(([id, category]) => ({
    id,
    category,
  }));
  if (inferred.length === 0) {
    return CATEGORY_ORDER.map((c) => ({
      taskId: c,
      category: c,
      label: CAT_SHORT[c],
    }));
  }
  return labeledTaskTitles(inferred).map((t) => ({
    taskId: t.id,
    category: t.category,
    label: t.title,
  }));
}

function shortName(id: string): string {
  const slash = id.lastIndexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

/** Candidates × tasks matrix with keyboard nav (plans/09 §2.3, plans/15 §A1). */
export function ArenaGrid() {
  const runId = useRunStore((s) => s.run.id);
  const candidates = useRunStore((s) => s.candidates);
  const cells = useRunStore((s) => s.cells);
  const runStatus = useRunStore((s) => s.run.status);
  const parameters = useRunStore((s) => s.run.parameters);

  const columns = useMemo(
    () => columnsFromRun(parameters, cells.values()),
    [cells, parameters],
  );

  const terminal = isTerminal(runStatus);
  const [focus, setFocus] = useState({ row: 0, col: 0 });
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    setNarrow(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const move = useCallback(
    (dRow: number, dCol: number) => {
      setFocus((f) => ({
        row: Math.max(0, Math.min(candidates.length - 1, f.row + dRow)),
        col: Math.max(0, Math.min(columns.length - 1, f.col + dCol)),
      }));
    },
    [candidates.length, columns.length],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1, 0);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1, 0);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(0, -1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      move(0, 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocus((f) => ({ ...f, col: 0 }));
    } else if (e.key === "End") {
      e.preventDefault();
      setFocus((f) => ({ ...f, col: columns.length - 1 }));
    }
  };

  const rowAvg = (candidateId: string): number | null => {
    const scores: number[] = [];
    for (const col of columns) {
      const cell = cells.get(cellKey(candidateId, col.taskId));
      if (cell?.medianAcrossTrials != null) scores.push(cell.medianAcrossTrials);
    }
    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  if (narrow) {
    return (
      <div className="flex flex-col gap-4">
        {candidates.map((cand) => (
          <details key={cand} className="rounded-md border border-line-subtle bg-ink-900 open:bg-ink-900">
            <summary className="cursor-pointer px-4 py-3 font-mono text-sm text-bright">
              {shortName(cand)}
              <span className="ml-2 text-dim">
                {rowAvg(cand) != null ? formatScore(rowAvg(cand)!) : "—"}
              </span>
            </summary>
            <ul className="flex flex-col gap-1 border-t border-line-subtle px-2 py-2">
              {columns.map((col) => {
                const cell = cells.get(cellKey(cand, col.taskId));
                return (
                  <li key={col.taskId}>
                    <Link
                      href={buildCellHref(runId, cand, col.category, null, col.taskId)}
                      data-testid={`cell-${cand}-${col.taskId}`}
                      className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm hover:bg-ink-800"
                    >
                      <span className="text-dim">{col.label}</span>
                      <span className="font-mono tabular-nums text-body">
                        {cell?.medianAcrossTrials != null
                          ? formatScore(cell.medianAcrossTrials)
                          : "·"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" onKeyDown={onKeyDown}>
      <div
        role="grid"
        aria-label="Arena: candidates by task"
        className="inline-grid gap-1"
        style={{
          gridTemplateColumns: `minmax(8rem,10rem) repeat(${columns.length}, 6rem) 4rem`,
        }}
      >
        <div role="row" className="contents">
          <div role="columnheader" className="px-2 py-1 text-xs text-faint">
            Model
          </div>
          {columns.map((col) => (
            <div
              key={col.taskId}
              role="columnheader"
              className="px-1 py-1 text-center font-mono text-xs text-dim"
            >
              {col.label}
            </div>
          ))}
          <div role="columnheader" className="px-1 py-1 text-center text-xs text-faint">
            avg
          </div>
        </div>

        {candidates.map((cand, row) => {
          const avg = rowAvg(cand);
          return (
            <div key={cand} role="row" className="contents">
              <div
                role="rowheader"
                className={cn(
                  "sticky left-0 z-10 flex items-center truncate bg-ink-950 px-2 font-mono text-xs text-body",
                )}
              >
                <Tooltip content={cand}>
                  <span className="truncate">{shortName(cand)}</span>
                </Tooltip>
              </div>
              {columns.map((col, colIdx) => {
                const focused = focus.row === row && focus.col === colIdx;
                return (
                  <ArenaCell
                    key={col.taskId}
                    cell={cells.get(cellKey(cand, col.taskId))}
                    candidateModelId={cand}
                    category={col.category}
                    taskId={col.taskId}
                    runTerminal={terminal}
                    focused={focused}
                    href={buildCellHref(runId, cand, col.category, null, col.taskId)}
                    tabIndex={focused ? 0 : -1}
                    onFocus={() => setFocus({ row, col: colIdx })}
                  />
                );
              })}
              <div
                role="gridcell"
                className="flex items-center justify-center font-mono text-xs tabular-nums text-dim"
              >
                {avg != null ? formatScore(avg) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
