"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildCellHref } from "@/lib/cellRef";
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
};

function shortName(id: string): string {
  const slash = id.lastIndexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

/** Candidates × categories matrix with keyboard nav (plans/09 §2.3, plans/15 §A1). */
export function ArenaGrid() {
  const runId = useRunStore((s) => s.run.id);
  const candidates = useRunStore((s) => s.candidates);
  const cells = useRunStore((s) => s.cells);
  const runStatus = useRunStore((s) => s.run.status);
  const parameters = useRunStore((s) => s.run.parameters);

  const categories = useMemo(() => {
    const fromParams = parameters.categories;
    if (Array.isArray(fromParams) && fromParams.length > 0) {
      return CATEGORY_ORDER.filter((c) => (fromParams as string[]).includes(c));
    }
    // Infer from cells
    const present = new Set<Category>();
    for (const c of cells.values()) present.add(c.category);
    if (present.size === 0) return [...CATEGORY_ORDER];
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [cells, parameters.categories]);

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
        col: Math.max(0, Math.min(categories.length - 1, f.col + dCol)),
      }));
    },
    [candidates.length, categories.length],
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
      setFocus((f) => ({ ...f, col: categories.length - 1 }));
    }
  };

  const rowAvg = (candidateId: string): number | null => {
    const scores: number[] = [];
    for (const cat of categories) {
      const cell = cells.get(cellKey(candidateId, cat));
      if (cell?.medianAcrossTrials != null) scores.push(cell.medianAcrossTrials);
    }
    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  // Accordion list <640px
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
              {categories.map((cat) => {
                const cell = cells.get(cellKey(cand, cat));
                return (
                  <li key={cat}>
                    <Link
                      href={buildCellHref(runId, cand, cat)}
                      data-testid={`cell-${cand}-${cat}`}
                      className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm hover:bg-ink-800"
                    >
                      <span className="text-dim">{CAT_SHORT[cat]}</span>
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
        aria-label="Arena: candidates by category"
        className="inline-grid gap-1"
        style={{
          gridTemplateColumns: `minmax(8rem,10rem) repeat(${categories.length}, 6rem) 4rem`,
        }}
      >
        {/* Header row */}
        <div role="row" className="contents">
          <div role="columnheader" className="px-2 py-1 text-xs text-faint">
            Model
          </div>
          {categories.map((cat) => (
            <div
              key={cat}
              role="columnheader"
              className="px-1 py-1 text-center font-mono text-xs text-dim"
            >
              {CAT_SHORT[cat]}
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
              {categories.map((cat, col) => {
                const focused = focus.row === row && focus.col === col;
                return (
                  <ArenaCell
                    key={cat}
                    cell={cells.get(cellKey(cand, cat))}
                    candidateModelId={cand}
                    category={cat}
                    runTerminal={terminal}
                    focused={focused}
                    href={buildCellHref(runId, cand, cat)}
                    tabIndex={focused ? 0 : -1}
                    onFocus={() => setFocus({ row, col })}
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
