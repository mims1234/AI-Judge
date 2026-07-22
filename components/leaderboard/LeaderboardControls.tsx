"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Input";
import { CATEGORY_ORDER, type Category } from "@/lib/schemas";
import type { BundleRow } from "@/lib/bundles/types";

export type LeaderboardControlsProps = {
  bundles: BundleRow[];
  bundleSlug: string;
  category: Category | "overall";
  demo?: boolean;
};

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function hrefFor(bundle: string, category: string, demo?: boolean): string {
  const p = new URLSearchParams();
  p.set("bundle", bundle);
  if (category !== "overall") p.set("category", category);
  if (demo) p.set("demo", "1");
  return `/leaderboard?${p.toString()}`;
}

/** Bundle + category selectors and export links (plans/10 §2.2). */
export function LeaderboardControls({
  bundles,
  bundleSlug,
  category,
  demo,
}: LeaderboardControlsProps) {
  const router = useRouter();
  const exportBase = `/api/leaderboard?bundle=${encodeURIComponent(bundleSlug)}${
    category !== "overall" ? `&category=${category}` : ""
  }`;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-dim">
          Bundle
          <Select
            name="bundle"
            value={bundleSlug}
            className="min-w-[200px]"
            aria-label="Bundle"
            onChange={(e) => {
              router.push(hrefFor(e.target.value, category, demo));
            }}
          >
            {bundles.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name} ({b.version})
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-dim">
          Category
          <Select
            name="category"
            value={category}
            className="min-w-[160px]"
            aria-label="Category"
            onChange={(e) => {
              router.push(hrefFor(bundleSlug, e.target.value, demo));
            }}
          >
            <option value="overall">Overall</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {capitalize(c)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`${exportBase}&format=csv`}
          download
          data-testid="export-leaderboard-csv"
          className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-body transition-colors duration-150 hover:border-teal-400 hover:text-bright"
        >
          Export CSV
        </a>
        <a
          href={`${exportBase}&format=json`}
          download
          data-testid="export-leaderboard-json"
          className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-body transition-colors duration-150 hover:border-teal-400 hover:text-bright"
        >
          Export JSON
        </a>
        <Link
          href={hrefFor(bundleSlug, category, !demo)}
          className="text-xs text-dim underline-offset-2 hover:text-bright hover:underline"
        >
          {demo ? "Exit demo" : "Try demo data"}
        </Link>
      </div>
    </div>
  );
}
