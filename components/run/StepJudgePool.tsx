"use client";

import { useState } from "react";
import Link from "next/link";
import { formatContext } from "@/lib/format";
import type { PickerModel } from "@/components/models/ModelPicker";
import { ModelPicker } from "@/components/models/ModelPicker";
import { OverlapWarning } from "@/components/run/OverlapWarning";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";

/** Step 3 — judge pool (≥3, max 12) + overlap warnings (plans/09 §1.4). */
export function StepJudgePool({
  models,
  selectedIds,
  candidateIds,
  onChange,
  catalogEmpty,
}: {
  models: PickerModel[];
  selectedIds: string[];
  candidateIds: string[];
  onChange: (ids: string[]) => void;
  catalogEmpty: boolean;
}) {
  const [open, setOpen] = useState(false);
  const byId = new Map(models.map((m) => [m.id, m]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((m): m is PickerModel => !!m);

  const overlap = candidateIds.filter((id) => selectedIds.includes(id));
  const escalate = overlap.length > 0 && selectedIds.length < 4;

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else if (selectedIds.length < 12) {
      onChange([...selectedIds, id]);
    }
  };

  if (catalogEmpty) {
    return (
      <div data-testid="step-heading-3">
        <EmptyState
          title="Model catalog is empty."
          body="Refresh the catalog from Settings before picking judges."
          action={
            <Link
              href="/settings"
              className="rounded-md bg-teal-500 px-3 py-2 text-sm text-ink-950"
            >
              Open settings
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="step-heading-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl text-bright">Judge pool</h2>
          <p className="mt-1 text-sm text-dim">
            Each category gets one seeded 3-judge panel drawn from this pool; the
            same panel judges every candidate in that category.
          </p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Add judges
        </Button>
      </div>

      <OverlapWarning overlap={overlap} escalate={escalate} />

      {selected.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-subtle px-4 py-8 text-center text-sm text-dim">
          Pick at least 3 judges for the pool.
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
              <div className="flex items-center gap-2">
                <Badge>{formatContext(m.context_length)}</Badge>
                {overlap.includes(m.id) && <Badge tone="warn">overlap</Badge>}
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

      {selectedIds.length > 0 && selectedIds.length < 3 && (
        <p role="status" className="text-sm text-fail-400">
          Need {3 - selectedIds.length} more judge{selectedIds.length === 2 ? "" : "s"} (minimum 3).
        </p>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add judges"
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
            maxSelection={12}
            autoFocusSearch
          />
        </div>
      </Modal>
    </div>
  );
}
