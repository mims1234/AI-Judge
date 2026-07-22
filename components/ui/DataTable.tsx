"use client";

import { cn } from "@/lib/cn";

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  mono?: boolean; // right-aligned mono numerics
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  className?: string;
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  expandable?: {
    render: (r: T) => React.ReactNode;
    isExpanded: (r: T) => boolean;
    onToggle: (r: T) => void;
  };
  stickyHeader?: boolean;
  emptyState?: React.ReactNode;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  caption?: string;
  className?: string;
  rowClassName?: (r: T) => string | undefined;
  rowTestId?: (r: T) => string | undefined;
};

/** Semantic <table> shell — sticky header, sortable headers with aria-sort,
 *  keyboard-activatable rows, expandable rows with aria-expanded (plans/07 §3.7). */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  expandable,
  stickyHeader = false,
  emptyState,
  sort,
  onSort,
  caption,
  className,
  rowClassName,
  rowTestId,
}: DataTableProps<T>) {
  const colSpan = columns.length + (expandable ? 1 : 0);

  return (
    <div className={cn("overflow-x-auto rounded-md border border-line-subtle bg-ink-900", className)}>
      <table className="min-w-full border-collapse">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead
          className={cn(
            stickyHeader && "sticky top-0 z-10 bg-ink-900/95 backdrop-blur-sm",
          )}
        >
          <tr className="border-b border-line-strong">
            {expandable && <th scope="col" className="w-8 px-2 py-2" aria-label="Expand rows" />}
            {columns.map((col) => {
              const sorted = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    col.sortable
                      ? sorted
                        ? sort?.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                  className={cn(
                    "px-3 py-2 text-xs font-normal uppercase tracking-wide text-dim",
                    (col.align === "right" || col.mono) && "text-right",
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort?.(col.key)}
                      className="inline-flex items-center gap-1 uppercase tracking-wide transition-colors duration-150 hover:text-bright"
                    >
                      {col.header}
                      <span aria-hidden="true" className={cn("text-[9px]", !sorted && "opacity-30")}>
                        {sorted ? (sort?.dir === "asc" ? "▲" : "▼") : "▲"}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && emptyState && (
            <tr>
              <td colSpan={colSpan} className="px-3 py-6">
                {emptyState}
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const key = rowKey(row);
            const expanded = expandable?.isExpanded(row) ?? false;
            const clickable = !!onRowClick;
            return (
              <DataRow
                key={key}
                row={row}
                columns={columns}
                clickable={clickable}
                onRowClick={onRowClick}
                expandable={expandable}
                expanded={expanded}
                colSpan={colSpan}
                className={rowClassName?.(row)}
                testId={rowTestId?.(row)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DataRow<T>({
  row,
  columns,
  clickable,
  onRowClick,
  expandable,
  expanded,
  colSpan,
  className,
  testId,
}: {
  row: T;
  columns: Column<T>[];
  clickable: boolean;
  onRowClick?: (r: T) => void;
  expandable?: DataTableProps<T>["expandable"];
  expanded: boolean;
  colSpan: number;
  className?: string;
  testId?: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!clickable || !onRowClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick(row);
    }
  };

  return (
    <>
      <tr
        tabIndex={clickable ? 0 : undefined}
        data-testid={testId}
        onClick={clickable && onRowClick ? () => onRowClick(row) : undefined}
        onKeyDown={onKeyDown}
        className={cn(
          "border-b border-line-subtle transition-colors duration-150 last:border-b-0 hover:bg-ink-800",
          clickable && "cursor-pointer",
          className,
        )}
      >
        {expandable && (
          <td className="px-2 py-2">
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse row details" : "Expand row details"}
              onClick={(e) => {
                e.stopPropagation();
                expandable.onToggle(row);
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-dim transition-colors duration-150 hover:bg-ink-700 hover:text-bright"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                aria-hidden="true"
                className={cn("transition-transform duration-150", expanded && "rotate-90")}
              >
                <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </td>
        )}
        {columns.map((col) => (
          <td
            key={col.key}
            className={cn(
              "px-3 py-2 text-sm text-body",
              col.mono && "text-right font-mono tabular-nums",
              col.align === "right" && "text-right",
              col.className,
            )}
          >
            {col.render(row)}
          </td>
        ))}
      </tr>
      {expandable && expanded && (
        <tr className="border-b border-line-subtle bg-ink-950/60">
          <td colSpan={colSpan} className="px-4 py-4">
            {expandable.render(row)}
          </td>
        </tr>
      )}
    </>
  );
}
