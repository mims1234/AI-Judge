"use client";

import { useId, useRef } from "react";
import { cn } from "@/lib/cn";

export type TabItem = {
  key: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export type TabsProps = {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  ariaLabel: string;
  className?: string;
  idBase?: string; // pass the same value to TabPanel for aria wiring
};

/** Underline-style tabs with roving tabindex (plans/07 §3.8). */
export function Tabs({ tabs, activeKey, onChange, ariaLabel, className, idBase }: TabsProps) {
  const generated = useId();
  const base = idBase ?? generated;
  const listRef = useRef<HTMLDivElement>(null);

  const enabledTabs = tabs.filter((t) => !t.disabled);

  const focusTab = (key: string) => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab-key="${CSS.escape(key)}"]`,
    );
    el?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const current = enabledTabs[index];
    if (!current) return;
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % enabledTabs.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + enabledTabs.length) % enabledTabs.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = enabledTabs.length - 1;
    if (nextIndex == null) return;
    e.preventDefault();
    const next = enabledTabs[nextIndex];
    if (!next) return;
    onChange(next.key);
    focusTab(next.key);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex items-center gap-1 border-b border-line-subtle", className)}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        const rovingIndex = enabledTabs.findIndex((t) => t.key === tab.key);
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.key}`}
            data-tab-key={tab.key}
            aria-selected={active}
            aria-controls={`${base}-panel-${tab.key}`}
            disabled={tab.disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKeyDown(e, rovingIndex)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-150",
              active
                ? "border-teal-400 text-bright"
                : "border-transparent text-dim hover:text-body",
              tab.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Panel wrapper pairing with Tabs (aria wiring). */
export function TabPanel({
  tabKey,
  idBase,
  activeKey,
  children,
  className,
}: {
  tabKey: string;
  idBase?: string;
  activeKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const fallback = useId();
  const base = idBase ?? fallback;
  if (tabKey !== activeKey) return null;
  return (
    <div
      role="tabpanel"
      id={`${base}-panel-${tabKey}`}
      aria-labelledby={`${base}-tab-${tabKey}`}
      className={className}
    >
      {children}
    </div>
  );
}
