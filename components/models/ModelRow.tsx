"use client";

import { cn } from "@/lib/cn";
import { formatContext, formatUsd } from "@/lib/format";
import { highlightSegments } from "@/lib/fuzzy";
import { Badge } from "@/components/ui/Badge";

export type PickerModel = {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt_usd_per_m: number; completion_usd_per_m: number } | null;
  is_free: boolean;
  supports_structured_outputs: boolean;
};

export type ModelRowProps = {
  model: PickerModel;
  highlight?: number[]; // fuzzy match indices into model.id
  active?: boolean; // keyboard cursor (palette)
  selected?: boolean; // multi-select (palette)
  selectable?: boolean; // palette multi-select chrome
  compact?: boolean; // single-line row (desktop height 44)
  onClick?: () => void;
  rowRole?: string;
};

function Price({ value, suffix }: { value: number | null | undefined; suffix: string }) {
  if (value == null) return <Badge title="Pricing unavailable">— {suffix}</Badge>;
  if (value === 0) return <Badge title="Free">$0 {suffix}</Badge>;
  return <Badge title={`$${value.toFixed(2)} per M tokens ${suffix === "in" ? "prompt" : "completion"}`}>
    {formatUsd(value)}/M {suffix}
  </Badge>;
}

/** One model row in the catalog/picker list (plans/08 §2.2). */
export function ModelRow({
  model,
  highlight,
  active = false,
  selected = false,
  selectable = false,
  compact = false,
  onClick,
  rowRole,
}: ModelRowProps) {
  const segments = highlight?.length ? highlightSegments(model.id, highlight) : null;

  return (
    <button
      type="button"
      role={rowRole}
      aria-selected={selectable ? selected : undefined}
      data-model-id={model.id}
      onClick={onClick}
      className={cn(
        "flex h-full w-full items-center gap-3 border-b border-line-subtle px-3 text-left transition-colors duration-150",
        active ? "bg-ink-700" : "hover:bg-ink-800",
        selected && "bg-teal-900/50 hover:bg-teal-900/70",
      )}
    >
      {selectable && (
        <span
          aria-hidden="true"
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
            selected ? "border-teal-500 bg-teal-500" : "border-line-strong bg-ink-950",
          )}
        >
          {selected && (
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-ink-950">
              <path d="M1.5 5.5l2.5 2.5 4.5-5.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className={cn("flex items-baseline gap-2", !compact && "flex-wrap")}>
          <span className="truncate text-sm text-bright">{model.name}</span>
          <span className="truncate font-mono text-xs text-dim">
            {segments
              ? segments.map((seg, i) =>
                  seg.match ? (
                    <span key={i} className="text-teal-400">
                      {seg.text}
                    </span>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )
              : model.id}
          </span>
        </span>
        {!compact && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badges model={model} />
          </span>
        )}
      </span>

      {compact && (
        <span className="hidden shrink-0 items-center gap-1.5 md:flex">
          <Badges model={model} />
        </span>
      )}
    </button>
  );
}

function Badges({ model }: { model: PickerModel }) {
  return (
    <>
      <Badge title="Context length">{formatContext(model.context_length)}</Badge>
      {model.is_free ? (
        <Badge tone="teal">FREE</Badge>
      ) : (
        <>
          <Price value={model.pricing?.prompt_usd_per_m} suffix="in" />
          <Price value={model.pricing?.completion_usd_per_m} suffix="out" />
        </>
      )}
      {model.supports_structured_outputs && <Badge title="Supports structured outputs">JSON</Badge>}
    </>
  );
}
