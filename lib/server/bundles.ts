import "server-only";

import { DEFAULT_BUNDLE_SLUG } from "@/lib/bundles/defaults";
import type { BundleRow, TaskRow } from "@/lib/bundles/types";
import { prepare } from "@/lib/db";

export { DEFAULT_BUNDLE_SLUG };
export type { BundleRow, TaskRow };

/**
 * Server-only bundle reads for /bundles and the run wizard (plans/08 §3).
 * Bundle content is immutable and local — direct SQLite reads.
 */

export function listBundles(): BundleRow[] {
  return prepare(
    `SELECT id, name, version, slug, content_hash, status, changelog, created_at
     FROM bundles ORDER BY created_at DESC`,
  ).all() as BundleRow[];
}

export function getBundleBySlugOrId(slugOrId: string): BundleRow | null {
  const row = prepare(
    `SELECT id, name, version, slug, content_hash, status, changelog, created_at
     FROM bundles WHERE slug = ? OR id = ?`,
  ).get(slugOrId, slugOrId) as BundleRow | undefined;
  return row ?? null;
}

/** Canonical default = Octant; else oldest published. */
export function getDefaultBundle(): BundleRow | null {
  const octant = prepare(
    `SELECT id, name, version, slug, content_hash, status, changelog, created_at
      FROM bundles WHERE status = 'published' AND slug = ?`,
  ).get(DEFAULT_BUNDLE_SLUG) as BundleRow | undefined;
  if (octant) return octant;

  const row = prepare(
    `SELECT id, name, version, slug, content_hash, status, changelog, created_at
      FROM bundles WHERE status = 'published' ORDER BY created_at ASC LIMIT 1`,
  ).get() as BundleRow | undefined;
  return row ?? null;
}

/** Prefer Octant first, then newest-first for the rest (wizard / pickers). */
export function sortBundlesForPicker(bundles: BundleRow[]): BundleRow[] {
  return [...bundles].sort((a, b) => {
    if (a.slug === DEFAULT_BUNDLE_SLUG && b.slug !== DEFAULT_BUNDLE_SLUG) return -1;
    if (b.slug === DEFAULT_BUNDLE_SLUG && a.slug !== DEFAULT_BUNDLE_SLUG) return 1;
    return b.created_at - a.created_at;
  });
}

export function getBundleTasks(bundleId: string): TaskRow[] {
  return prepare(
    `SELECT id, bundle_id, category, wrapper, task_body, judge_prompt, output_schema, token_limit, weight
     FROM tasks WHERE bundle_id = ? ORDER BY category ASC`,
  ).all(bundleId) as TaskRow[];
}
