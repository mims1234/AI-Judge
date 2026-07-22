"use client";

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";

export type VirtualItem =
  | { type: "header"; id: string }
  | { type: "row"; id: string };

export type VirtualListHandle = {
  scrollItemIntoView: (index: number) => void;
};

export type VirtualListProps = {
  items: VirtualItem[];
  headerHeight: number;
  rowHeight: number;
  height: number; // px — measured by the consumer
  overscan?: number;
  renderHeader: (id: string) => React.ReactNode;
  renderRow: (id: string, index: number) => React.ReactNode;
  listRef?: Ref<VirtualListHandle>;
  onVisibleStartChange?: (index: number) => void;
  role?: string;
  ariaLabel?: string;
  className?: string;
};

/**
 * Hand-rolled fixed-height windowing (plans/08 §2.2): spacer div of total
 * height + absolutely-positioned visible slice. No react-virtual dependency.
 */
export function VirtualList({
  items,
  headerHeight,
  rowHeight,
  height,
  overscan = 10,
  renderHeader,
  renderRow,
  listRef,
  onVisibleStartChange,
  role,
  ariaLabel,
  className,
}: VirtualListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Prefix sums: offsets[i] = top of item i; offsets[items.length] = total.
  const offsets = useMemo(() => {
    const arr = new Array<number>(items.length + 1);
    arr[0] = 0;
    for (let i = 0; i < items.length; i++) {
      arr[i + 1] = arr[i]! + (items[i]!.type === "header" ? headerHeight : rowHeight);
    }
    return arr;
  }, [items, headerHeight, rowHeight]);

  const totalHeight = offsets[items.length] ?? 0;

  // First index whose bottom edge is below scrollTop.
  const findIndex = (y: number): number => {
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1]! <= y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const start = Math.max(0, findIndex(scrollTop) - overscan);
  const end = Math.min(items.length, findIndex(scrollTop + height) + 1 + overscan);

  // Report the first fully-visible index (sticky-header tracking).
  // Must run in an effect — calling into parent setState during render
  // triggers "Cannot update a component while rendering a different component".
  const firstVisible = findIndex(scrollTop);
  const lastReported = useRef(-1);
  useEffect(() => {
    if (!onVisibleStartChange || firstVisible === lastReported.current) return;
    lastReported.current = firstVisible;
    onVisibleStartChange(firstVisible);
  }, [firstVisible, onVisibleStartChange]);

  useImperativeHandle(listRef, () => ({
    scrollItemIntoView: (index: number) => {
      const el = containerRef.current;
      if (!el || index < 0 || index >= items.length) return;
      const top = offsets[index]!;
      const bottom = offsets[index + 1]!;
      const viewTop = el.scrollTop;
      const viewBottom = viewTop + el.clientHeight;
      if (top < viewTop) {
        el.scrollTop = top;
      } else if (bottom > viewBottom) {
        el.scrollTop = bottom - el.clientHeight;
      }
    },
  }));

  const slice = items.slice(start, end);

  return (
    <div
      ref={containerRef}
      role={role}
      aria-label={ariaLabel}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      style={{ height, overflowY: "auto" }}
      className={className}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {slice.map((item, i) => {
          const index = start + i;
          return (
            <div
              key={`${item.type}-${item.id}`}
              style={{
                position: "absolute",
                top: offsets[index],
                left: 0,
                right: 0,
                height: item.type === "header" ? headerHeight : rowHeight,
              }}
            >
              {item.type === "header" ? renderHeader(item.id) : renderRow(item.id, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
