"use client";

import Link from "next/link";
import { AuthorChip } from "@/components/bundles/AuthorChip";
import { PackQualityBadge } from "@/components/bundles/PackQualityBadge";
import { cn } from "@/lib/cn";
import { CATEGORY_ORDER, type Category } from "@/lib/schemas";
import { shortId } from "@/lib/format";
import type { BundleListItem } from "@/lib/bundles/types";

const CATEGORY_LABELS: Record<Category, string> = {
  roleplay: "Roleplay",
  coding: "Coding",
  math: "Math",
  research: "Research",
  marketing: "Marketing",
  poster: "Poster",
  story: "Story",
  judging: "Judging",
  general: "General",
  other: "Other",
};

export type BundleOption = BundleListItem;

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
  const selected = bundles.find((b) => b.id === bundleId) ?? null;
  const available = selected?.availableCategories?.length
    ? selected.availableCategories
    : CATEGORY_ORDER;
  const official = bundles.filter((b) => b.origin === "official");
  const custom = bundles.filter((b) => b.origin === "custom");
  const partial =
    selected != null && categories.length < available.length;

  const toggle = (cat: Category) => {
    if (categories.includes(cat)) {
      if (categories.length === 1) return;
      onCategories(categories.filter((c) => c !== cat));
    } else {
      onCategories(available.filter((c) => c === cat || categories.includes(c)));
    }
  };

  const renderCard = (b: BundleOption) => {
    const isOn = b.id === bundleId;
    return (
      <div key={b.id} className="relative">
        <button
          type="button"
          role="radio"
          aria-checked={isOn}
          onClick={() => onBundle(b.id)}
          className={cn(
            "w-full rounded-md border p-4 text-left transition-colors duration-150",
            isOn
              ? "border-teal-400/50 bg-teal-900/40"
              : "border-line-subtle bg-ink-900 hover:border-line-strong",
          )}
        >
          <div className="flex flex-wrap items-center gap-2 pr-16">
            <span className="font-mono text-sm text-bright">{b.slug}</span>
            {b.quality && <PackQualityBadge quality={b.quality} />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
            <span className="font-mono">hash {shortId(b.content_hash, 10)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">v{b.version}</span>
            <span aria-hidden="true">·</span>
            <span>
              {b.categoryCount} {b.categoryCount === 1 ? "task" : "tasks"}
            </span>
            {b.author && (
              <>
                <span aria-hidden="true">·</span>
                <AuthorChip author={b.author} />
              </>
            )}
          </div>
        </button>
        {/* Sibling of the radio, not a child — nested interactives fail axe (Q-F05). */}
        <Link
          href={`/bundles?bundle=${encodeURIComponent(b.slug)}`}
          className="absolute right-3 top-3.5 rounded-sm px-1 text-xs text-teal-300 underline-offset-2 hover:underline"
        >
          Details →
        </Link>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6" data-testid="step-heading-1">
      <div>
        <h2 className="text-xl text-bright">Bundle</h2>
        <p className="mt-1 text-sm text-dim">
          Official instruments are immutable. Custom packs use the types their
          author published.
        </p>
      </div>

      <div role="radiogroup" aria-label="Published bundles" className="flex flex-col gap-6">
        {bundles.length === 0 ? (
          <p className="text-sm text-fail-400">
            No published bundles. Seed the database, then return here.
          </p>
        ) : (
          <>
            {official.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-dim">
                  Official
                </h3>
                <div className="flex flex-col gap-3">{official.map(renderCard)}</div>
              </section>
            )}
            {custom.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-dim">
                  Custom packs
                </h3>
                <div className="flex flex-col gap-3">{custom.map(renderCard)}</div>
              </section>
            )}
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm text-body">Categories</h3>
        <p className="mt-0.5 text-xs text-dim">
          Chips are the types on this pack. Toggle to exclude.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {available.map((cat) => {
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
            A complete-run badge requires every type in this pack. Leaderboard
            still includes scored runs that are not cancelled.
          </p>
        )}
      </div>
    </div>
  );
}
