"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fuzzyFilter, type FuzzyScored } from "@/lib/fuzzy";
import { useAnnounce } from "@/components/ui/StatusAnnouncer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ModelRow, type PickerModel } from "@/components/models/ModelRow";
import { VirtualList, type VirtualItem, type VirtualListHandle } from "@/components/models/VirtualList";

export type { PickerModel };

export type ModelPickerProps = {
  variant: "page" | "palette"; // full page list vs ⌘K modal
  models: PickerModel[]; // passed in; picker does no fetching
  selectedIds?: string[]; // controlled multi-select (palette)
  onToggle?: (id: string) => void;
  maxSelection?: number;
  onOpenDetail?: (id: string) => void; // page variant → Drawer
  autoFocusSearch?: boolean;
  className?: string;
};

function providerOf(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(0, slash);
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function useMeasuredHeight(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(480);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setHeight(Math.max(240, el.clientHeight));
    });
    ro.observe(el);
    setHeight(Math.max(240, el.clientHeight));
    return () => ro.disconnect();
  }, []);
  return [ref, height];
}

const HEADER_H = 36;

/**
 * Fuzzy-search model selector — full-page catalog (page) and ⌘K multi-select
 * palette (palette), shared with the run wizard (plans/08 §2.2).
 */
export function ModelPicker({
  variant,
  models,
  selectedIds = [],
  onToggle,
  maxSelection,
  onOpenDetail,
  autoFocusSearch = false,
  className,
}: ModelPickerProps) {
  const isPalette = variant === "palette";
  const [query, setQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [provider, setProvider] = useState("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [stickyProvider, setStickyProvider] = useState<string | null>(null);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const rowH = isMobile ? 64 : 44;
  const [measureRef, listHeight] = useMeasuredHeight();
  const listHandle = useRef<VirtualListHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const announce = useAnnounce();

  // Pre-lowercase haystacks once (<5ms/450 models).
  const keysCache = useMemo(() => {
    const map = new Map<string, Array<{ raw: string; lower: string }>>();
    for (const m of models) {
      const p = providerOf(m.id);
      map.set(m.id, [
        { raw: m.id, lower: m.id.toLowerCase() },
        { raw: m.name, lower: m.name.toLowerCase() },
        { raw: p, lower: p.toLowerCase() },
      ]);
    }
    return map;
  }, [models]);

  const providers = useMemo(() => {
    const set = new Set(models.map((m) => providerOf(m.id)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [models]);

  const filtered = useMemo(() => {
    let base = models;
    if (freeOnly) base = base.filter((m) => m.is_free);
    if (provider !== "all") base = base.filter((m) => providerOf(m.id) === provider);
    return fuzzyFilter(base, query, (m) => keysCache.get(m.id)!);
  }, [models, freeOnly, provider, query, keysCache]);

  // Group by provider; groups sorted alphabetically; zero-match groups vanish.
  const groups = useMemo(() => {
    const map = new Map<string, FuzzyScored<PickerModel>[]>();
    for (const s of filtered) {
      const p = providerOf(s.item.id);
      const arr = map.get(p) ?? [];
      arr.push(s);
      map.set(p, arr);
    }
    const out = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (!query.trim()) {
      for (const [, arr] of out) arr.sort((a, b) => a.item.id.localeCompare(b.item.id));
    }
    return out;
  }, [filtered, query]);

  const { flatItems, rowMeta, groupCounts } = useMemo(() => {
    const items: VirtualItem[] = [];
    const meta = new Map<string, FuzzyScored<PickerModel>>();
    const counts = new Map<string, number>();
    for (const [p, arr] of groups) {
      counts.set(p, arr.length);
      items.push({ type: "header", id: p });
      for (const s of arr) {
        items.push({ type: "row", id: s.item.id });
        meta.set(s.item.id, s);
      }
    }
    return { flatItems: items, rowMeta: meta, groupCounts: counts };
  }, [groups]);

  // Reset keyboard cursor when the list changes.
  useEffect(() => {
    setActiveIndex(flatItems.findIndex((i) => i.type === "row"));
  }, [flatItems]);

  const toggle = (id: string) => {
    if (!onToggle) return;
    const selected = selectedIds.includes(id);
    if (!selected && maxSelection != null && selectedIds.length >= maxSelection) {
      announce(`Maximum ${maxSelection} models — remove one first`);
      return;
    }
    onToggle(id);
    const name = id.split("/").pop() ?? id;
    announce(
      selected
        ? `${name} removed (${selectedIds.length - 1} selected)`
        : `${name} selected (${selectedIds.length + 1}${maxSelection ? ` of ${maxSelection}` : ""})`,
    );
  };

  const onRowClick = (id: string) => {
    if (isPalette) toggle(id);
    else onOpenDetail?.(id);
  };

  // Keyboard navigation (palette variant): ↑/↓ skip headers, Enter toggles.
  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
    e.preventDefault();
    if (e.key === "Enter") {
      const item = flatItems[activeIndex];
      if (item?.type === "row") toggle(item.id);
      return;
    }
    const dir = e.key === "ArrowDown" ? 1 : -1;
    let next = activeIndex;
    for (let steps = 0; steps < flatItems.length; steps++) {
      next = (next + dir + flatItems.length) % flatItems.length;
      if (flatItems[next]?.type === "row") break;
    }
    setActiveIndex(next);
    listHandle.current?.scrollItemIntoView(next);
  };

  // ⌘K / Ctrl+K focuses search (page variant).
  useEffect(() => {
    if (isPalette) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPalette]);

  const onVisibleStartChange = (index: number) => {
    for (let i = index; i >= 0; i--) {
      const item = flatItems[i];
      if (item?.type === "header") {
        setStickyProvider(item.id);
        return;
      }
    }
  };

  const selectedModels = useMemo(() => {
    const byId = new Map(models.map((m) => [m.id, m]));
    return selectedIds.map((id) => byId.get(id) ?? { id, name: id.split("/").pop() ?? id } as PickerModel);
  }, [selectedIds, models]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <div className="relative min-w-0 flex-1 basis-56">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          >
            <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <Input
            ref={searchRef}
            type="search"
            role={isPalette ? "combobox" : undefined}
            aria-expanded={isPalette ? true : undefined}
            aria-controls={isPalette ? "model-picker-list" : undefined}
            aria-label="Search models"
            placeholder={isPalette ? "Search models…" : "Search models…  (⌘K)"}
            value={query}
            autoFocus={autoFocusSearch || isPalette}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={isPalette ? onSearchKeyDown : undefined}
            className="w-full pl-9"
          />
        </div>

        {!isPalette && (
          <select
            aria-label="Filter by provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="cursor-pointer rounded-md border border-line-strong bg-ink-950 px-3 py-2 text-sm text-body transition-colors duration-150 focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
          >
            <option value="all">All providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-dim transition-colors duration-150 hover:text-body">
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => setFreeOnly(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded-sm border border-line-strong bg-ink-950 accent-teal-500"
          />
          Free models only
        </label>
      </div>

      {/* Palette: selected chips */}
      {isPalette && selectedModels.length > 0 && (
        <ul role="list" aria-label="Selected models" className="flex flex-wrap gap-1.5 pb-3">
          {selectedModels.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => toggle(m.id)}
                aria-label={`Remove ${m.id}`}
                className="group inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-900 px-2.5 py-1 text-xs text-teal-300 transition-colors duration-150 hover:border-fail-400/40 hover:bg-fail-900 hover:text-fail-400"
              >
                <span className="font-mono">{m.id}</span>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* List */}
      <div ref={measureRef} className="relative min-h-0 flex-1 rounded-md border border-line-subtle bg-ink-900">
        {flatItems.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={query ? `No models match “${query}”` : "No models to show"}
              body="Try a different search, or disable the free-only filter."
              action={
                <div className="flex gap-2">
                  {query && (
                    <button
                      type="button"
                      className="rounded-md border border-line-strong bg-ink-800 px-3 py-1.5 text-sm text-bright hover:bg-ink-700"
                      onClick={() => setQuery("")}
                    >
                      Clear search
                    </button>
                  )}
                  {freeOnly && (
                    <button
                      type="button"
                      className="rounded-md border border-line-strong bg-ink-800 px-3 py-1.5 text-sm text-bright hover:bg-ink-700"
                      onClick={() => setFreeOnly(false)}
                    >
                      Show all models
                    </button>
                  )}
                </div>
              }
            />
          </div>
        ) : (
          <>
            {/* sticky group header */}
            {stickyProvider && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-line-subtle bg-ink-950/95 px-3 py-1.5 text-xs uppercase tracking-wide text-dim backdrop-blur-sm"
                style={{ height: HEADER_H }}
              >
                <span className="font-mono">{stickyProvider}</span>
                <span className="font-mono tabular-nums">{groupCounts.get(stickyProvider) ?? 0}</span>
              </div>
            )}
            <VirtualList
              items={flatItems}
              headerHeight={HEADER_H}
              rowHeight={rowH}
              height={listHeight}
              listRef={listHandle}
              onVisibleStartChange={onVisibleStartChange}
              role={isPalette ? "listbox" : "list"}
              ariaLabel={isPalette ? "Models" : "Model catalog"}
              renderHeader={(id) => (
                <div className="flex h-full items-end justify-between px-3 pb-1.5 text-xs uppercase tracking-wide text-faint">
                  <span className="font-mono">{id}</span>
                  <span className="font-mono tabular-nums">{groupCounts.get(id) ?? 0}</span>
                </div>
              )}
              renderRow={(id, index) => {
                const scored = rowMeta.get(id);
                if (!scored) return null;
                const highlight =
                  query.trim() && scored.keyIndex === 0 && scored.indices.length > 0
                    ? scored.indices
                    : undefined;
                return (
                  <ModelRow
                    model={scored.item}
                    highlight={highlight}
                    active={isPalette && index === activeIndex}
                    selected={selectedIds.includes(id)}
                    selectable={isPalette}
                    compact={!isMobile}
                    rowRole={isPalette ? "option" : "listitem"}
                    onClick={() => onRowClick(id)}
                  />
                );
              }}
            />
          </>
        )}
      </div>

      {/* Palette footer */}
      {isPalette && (
        <div className="flex items-center justify-between pt-3 text-xs text-dim">
          <span className="font-mono tabular-nums">
            {selectedIds.length} selected{maxSelection ? ` · max ${maxSelection}` : ""}
          </span>
          <span aria-hidden="true">↑↓ navigate · Enter select · Esc close</span>
        </div>
      )}
    </div>
  );
}
