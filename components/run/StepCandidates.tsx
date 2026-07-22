"use client";

import { useState } from "react";
import Link from "next/link";
import { formatContext, formatUsd } from "@/lib/format";
import type { PickerModel } from "@/components/models/ModelPicker";
import { ModelPicker } from "@/components/models/ModelPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";

/** Step 2 — candidate selection via ModelPicker palette (plans/09 §1.3). */
export function StepCandidates({
  models,
  selectedIds,
  onChange,
  maxTokenLimit,
  catalogEmpty,
}: {
  models: PickerModel[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Largest task token_limit in the selected bundle — warn if context smaller. */
  maxTokenLimit: number;
  catalogEmpty: boolean;
}) {
  const [open, setOpen] = useState(false);
  const byId = new Map(models.map((m) => [m.id, m]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((m): m is PickerModel => !!m);

  const contextWarnings = selected.filter(
    (m) => m.context_length > 0 && m.context_length < maxTokenLimit,
  );

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else if (selectedIds.length < 8) {
      onChange([...selectedIds, id]);
    }
  };

  if (catalogEmpty) {
    return (
      <div data-testid="step-heading-2">
        <EmptyState
          title="Model catalog is empty."
          body="Refresh the catalog from Settings, or explore with the demo catalog."
          action={
            <div className="flex gap-2">
              <Link
                href="/settings"
                className="rounded-md bg-teal-500 px-3 py-2 text-sm text-ink-950"
              >
                Open settings
              </Link>
              <Link
                href="/run?demo=1&step=2"
                className="rounded-md border border-line-subtle px-3 py-2 text-sm text-body"
              >
                Use demo catalog
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="step-heading-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl text-bright">Candidates</h2>
          <p className="mt-1 text-sm text-dim">
            1–8 models to evaluate. Order does not matter.
          </p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Add candidates
        </Button>
      </div>

      {selected.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-subtle px-4 py-8 text-center text-sm text-dim">
          No candidates yet — open the picker to add models.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {selected.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-subtle bg-ink-900 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-bright">{m.name}</div>
                <div className="font-mono text-xs text-dim">{m.id}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{formatContext(m.context_length)}</Badge>
                {m.pricing ? (
                  <Badge tone="neutral">
                    {formatUsd(m.pricing.prompt_usd_per_m)}/{formatUsd(m.pricing.completion_usd_per_m)} /M
                  </Badge>
                ) : (
                  <Badge tone="warn">unpriced</Badge>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${m.name}`}
                  onClick={() => onChange(selectedIds.filter((x) => x !== m.id))}
                  className="rounded-sm px-2 py-1 text-dim hover:bg-ink-800 hover:text-bright"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {contextWarnings.length > 0 && (
        <p role="status" className="text-sm text-warn-400">
          Context smaller than the largest task ({maxTokenLimit} tok):{" "}
          {contextWarnings.map((m) => m.id).join(", ")}. Preflight will confirm.
        </p>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add candidates"
        wide
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done · {selectedIds.length} selected
            </Button>
          </div>
        }
      >
        <div className="h-[min(60vh,480px)]">
          <ModelPicker
            variant="palette"
            models={models}
            selectedIds={selectedIds}
            onToggle={toggle}
            maxSelection={8}
            autoFocusSearch
          />
        </div>
      </Modal>
    </div>
  );
}
