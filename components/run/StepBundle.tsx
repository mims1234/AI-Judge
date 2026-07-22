"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { CATEGORY_ORDER, type Category } from "@/lib/schemas";
import { shortId } from "@/lib/format";
import type { BundleRow } from "@/lib/server/bundles";

const CATEGORY_LABELS: Record<Category, string> = {
  roleplay: "Roleplay",
  coding: "Coding",
  math: "Math",
  research: "Research",
  marketing: "Marketing",
  poster: "Poster",
  story: "Story",
  judging: "Judging",
};

export type BundleOption = BundleRow & { categoryCount: number };

/** Step 1 — pick bundle + category include/exclude (plans/09 §1.2). */
export function StepBundle({
  bundles,
  bundleId,
  categories,
  onBundle,
  onCategories,
}: {
  bundles: BundleOption[];
  bundleId: string | null;
  categories: Category[];
  onBundle: (id: string) => void;
  onCategories: (cats: Category[]) => void;
}) {
  const partial = categories.length < CATEGORY_ORDER.length;

  const toggle = (cat: Category) => {
    if (categories.includes(cat)) {
      if (categories.length === 1) return; // keep ≥1
      onCategories(categories.filter((c) => c !== cat));
    } else {
      onCategories(
        CATEGORY_ORDER.filter((c) => c === cat || categories.includes(c)),
      );
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="step-heading-1">
      <div>
        <h2 className="text-xl text-bright">Bundle</h2>
        <p className="mt-1 text-sm text-dim">
          Choose an immutable benchmark version. Tasks never change after publish.
        </p>
      </div>

      <div role="radiogroup" aria-label="Published bundles" className="flex flex-col gap-3">
        {bundles.length === 0 ? (
          <p className="text-sm text-fail-400">
            No published bundles. Seed the database, then return here.
          </p>
        ) : (
          bundles.map((b) => {
            const selected = b.id === bundleId;
            return (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onBundle(b.id)}
                className={cn(
                  "rounded-md border p-4 text-left transition-colors duration-150",
                  selected
                    ? "border-teal-400/50 bg-teal-900/40"
                    : "border-line-subtle bg-ink-900 hover:border-line-strong",
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm text-bright">{b.slug}</span>
                  <span className="font-mono text-xs text-dim">v{b.version}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-dim">
                  <span className="font-mono">hash {shortId(b.content_hash, 10)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{b.categoryCount} categories</span>
                  <Link
                    href={`/bundles?bundle=${encodeURIComponent(b.slug)}`}
                    className="text-teal-300 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View details →
                  </Link>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div>
        <h3 className="text-sm text-body">Categories</h3>
        <p className="mt-0.5 text-xs text-dim">All on by default. Toggle to exclude.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORY_ORDER.map((cat) => {
            const on = categories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(cat)}
                className={cn(
                  "rounded-sm border px-2.5 py-1.5 font-mono text-xs transition-colors duration-150",
                  on
                    ? "border-teal-400/40 bg-teal-900 text-teal-300"
                    : "border-line-subtle bg-ink-900 text-faint hover:text-dim",
                )}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>
        {partial && (
          <p className="mt-3 text-sm text-dim">
            Partial runs never enter the main leaderboard — only complete bundle
            runs are ranked.
          </p>
        )}
      </div>
    </div>
  );
}
