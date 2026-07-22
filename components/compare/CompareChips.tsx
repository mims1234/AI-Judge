"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ModelPicker, type PickerModel } from "@/components/models/ModelPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Input";
import type { BundleRow } from "@/lib/bundles/types";

export type CompareChipsProps = {
  bundleSlug: string;
  bundles: BundleRow[];
  selectedIds: string[];
  eligibleIds: string[];
  demo?: boolean;
};

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function hrefFor(bundle: string, models: string[], demo?: boolean): string {
  const p = new URLSearchParams();
  p.set("bundle", bundle);
  if (models.length) p.set("models", models.join(","));
  if (demo) p.set("demo", "1");
  return `/compare?${p.toString()}`;
}

/** Model chips + Add-model palette + bundle select (plans/10 §3.2). */
export function CompareChips({
  bundleSlug,
  bundles,
  selectedIds,
  eligibleIds,
  demo,
}: CompareChipsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selectedIds);
  const [models, setModels] = useState<PickerModel[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => setDraft(selectedIds), [selectedIds]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    if (demo) {
      setModels(
        eligibleIds.map((id) => ({
          id,
          name: modelShort(id),
          context_length: 128_000,
          pricing: null,
          is_free: false,
          supports_structured_outputs: true,
        })),
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch("/api/models")
      .then((r) => r.json())
      .then((data: { models?: PickerModel[] }) => {
        if (cancelled) return;
        const eligible = new Set(eligibleIds);
        const list = (data.models ?? []).filter((m) => eligible.has(m.id));
        setModels(list.length > 0 ? list : data.models ?? []);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, demo, eligibleIds]);

  const push = useCallback(
    (bundle: string, ids: string[]) => {
      router.push(hrefFor(bundle, ids, demo));
    },
    [router, demo],
  );

  const remove = (id: string) => {
    push(
      bundleSlug,
      selectedIds.filter((x) => x !== id),
    );
  };

  const eligibleSet = useMemo(() => new Set(eligibleIds), [eligibleIds]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-dim">
          Bundle
          <Select
            value={bundleSlug}
            aria-label="Bundle"
            className="min-w-[200px]"
            onChange={(e) => push(e.target.value, selectedIds)}
          >
            {bundles.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name} ({b.version})
              </option>
            ))}
          </Select>
        </label>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={selectedIds.length >= 4}
        >
          + Add model
          <kbd className="ml-1 hidden font-mono text-[10px] text-dim sm:inline">⌘K</kbd>
        </Button>
      </div>

      <ul className="flex flex-wrap gap-2" aria-label="Selected models">
        {selectedIds.length === 0 && (
          <li className="text-sm text-dim">No models selected — add up to 4.</li>
        )}
        {selectedIds.map((id) => {
          const hasRuns = eligibleSet.has(id) || demo;
          return (
            <li key={id}>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-ink-900 px-2.5 py-1 text-sm">
                <span className="text-bright">{modelShort(id)}</span>
                {!hasRuns && <Badge tone="warn">no runs</Badge>}
                <button
                  type="button"
                  aria-label={`Remove ${id}`}
                  onClick={() => remove(id)}
                  className="ml-0.5 text-dim transition-colors duration-150 hover:text-bright"
                >
                  ×
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add models to compare"
        wide
      >
        <p className="mb-3 text-sm text-dim">
          Pick up to 4 models with at least one complete run in this bundle.
          {loading && " Loading catalog…"}
        </p>
        <div className="h-[420px]">
          <ModelPicker
            variant="palette"
            models={models}
            selectedIds={draft}
            maxSelection={4}
            onToggle={(id) => {
              setDraft((cur) => {
                if (cur.includes(id)) return cur.filter((x) => x !== id);
                if (cur.length >= 4) return cur;
                return [...cur, id];
              });
            }}
            autoFocusSearch
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              push(bundleSlug, draft);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </Modal>
    </div>
  );
}
