"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export type FeedbackChipProps = {
  kind: "good" | "terrible" | "missing" | "violation" | "critical";
  children: React.ReactNode; // one feedback bullet, plain text
};

const KIND_STYLES: Record<
  FeedbackChipProps["kind"],
  { classes: string; prefix: string; label: string }
> = {
  good: {
    classes: "bg-pass-900 text-pass-400",
    prefix: "+",
    label: "good",
  },
  terrible: {
    classes: "bg-fail-900 text-fail-400",
    prefix: "−",
    label: "terrible",
  },
  missing: {
    classes: "bg-warn-900 text-warn-400",
    prefix: "∅",
    label: "missing",
  },
  violation: {
    classes: "bg-fail-900 text-fail-400 border border-dashed border-fail-400/50",
    prefix: "⚠",
    label: "constraint violation",
  },
  critical: {
    classes: "bg-fail-400 text-ink-950 font-medium",
    prefix: "!!",
    label: "critical error",
  },
};

const TRUNCATE_AT = 120;

function truncate(text: string): { short: string; truncated: boolean } {
  if (text.length <= TRUNCATE_AT) return { short: text, truncated: false };
  const cut = text.slice(0, TRUNCATE_AT);
  const atSpace = cut.lastIndexOf(" ");
  return { short: `${cut.slice(0, atSpace > 60 ? atSpace : TRUNCATE_AT)}…`, truncated: true };
}

/** Single feedback chip with a distinct prefix glyph (plans/07 §3.3). */
export function FeedbackChip({ kind, children }: FeedbackChipProps) {
  const [expanded, setExpanded] = useState(false);
  const style = KIND_STYLES[kind];
  const text = typeof children === "string" ? children : null;
  const { short, truncated } = text ? truncate(text) : { short: null, truncated: false };

  const content = (
    <>
      <span aria-hidden="true" className="font-mono font-semibold">
        {style.prefix}
      </span>
      <span>{expanded || !truncated ? children : short}</span>
    </>
  );

  const base = cn(
    "inline-flex items-start gap-1.5 rounded-full px-2.5 py-1 text-xs leading-4",
    style.classes,
    expanded && "w-full whitespace-normal rounded-md",
  );

  if (truncated) {
    return (
      <button
        type="button"
        className={cn(base, "text-left transition-colors duration-150 hover:brightness-125")}
        title={expanded ? undefined : (text ?? undefined)}
        aria-expanded={expanded}
        aria-label={`${style.label}: ${text ?? ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={base} title={text && text.length > 60 ? text : undefined}>
      {content}
    </span>
  );
}

export type FeedbackChipListProps = {
  kind: FeedbackChipProps["kind"];
  items: string[];
  maxVisible?: number; // default 3, "+N more" expands inline
  className?: string;
};

export function FeedbackChipList({ kind, items, maxVisible = 3, className }: FeedbackChipListProps) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return null;

  const visible = showAll ? items : items.slice(0, maxVisible);
  const hidden = items.length - visible.length;

  return (
    <ul role="list" className={cn("flex flex-wrap items-start gap-1.5", className)}>
      {visible.map((item, i) => (
        <li key={`${kind}-${i}`}>
          <FeedbackChip kind={kind}>{item}</FeedbackChip>
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-dim transition-colors duration-150 hover:bg-ink-800 hover:text-bright"
            aria-expanded={showAll}
            onClick={() => setShowAll(true)}
          >
            +{hidden} more
          </button>
        </li>
      )}
      {showAll && items.length > maxVisible && (
        <li>
          <button
            type="button"
            className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-dim transition-colors duration-150 hover:bg-ink-800 hover:text-bright"
            aria-expanded={showAll}
            onClick={() => setShowAll(false)}
          >
            Show less
          </button>
        </li>
      )}
    </ul>
  );
}
