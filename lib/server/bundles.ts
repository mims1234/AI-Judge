import "server-only";

import { DEFAULT_BUNDLE_SLUG } from "@/lib/bundles/defaults";
import type { PackReview } from "@/lib/bundles/custom";
import {
  BUNDLE_SELECT,
  TASK_SELECT,
  type BundleAuthor,
  type BundleListItem,
  type BundleRow,
  type TaskRow,
} from "@/lib/bundles/types";
import { prepare } from "@/lib/db";
import { CATEGORY_ORDER } from "@/lib/schemas";

export { DEFAULT_BUNDLE_SLUG };
export type { BundleRow, TaskRow, BundleListItem, BundleAuthor };

/**
 * Server-only bundle reads for /bundles and the run wizard (plans/08 §3).
 * Bundle content is immutable and local — direct SQLite reads.
 */

function parseQuality(raw: string | null): PackReview | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PackReview;
  } catch {
    return null;
  }
}

function authorsById(userIds: Array<string | null>): Map<string, BundleAuthor> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = prepare(
    `SELECT id, username, avatar_url FROM users WHERE id IN (${placeholders})`,
  ).all(...ids) as BundleAuthor[];
  return new Map(rows.map((row) => [row.id, row]));
}

function tasksByBundleIds(bundleIds: string[]): Map<string, TaskRow[]> {
  const map = new Map<string, TaskRow[]>();
  if (bundleIds.length === 0) return map;
  const placeholders = bundleIds.map(() => "?").join(",");
  const rows = prepare(
    `SELECT ${TASK_SELECT}
     FROM tasks WHERE bundle_id IN (${placeholders})
     ORDER BY category ASC, rowid ASC`,
  ).all(...bundleIds) as TaskRow[];
  for (const row of rows) {
    const list = map.get(row.bundle_id) ?? [];
    list.push(row);
    map.set(row.bundle_id, list);
  }
  return map;
}

export function attachBundleMeta(bundles: BundleRow[]): BundleListItem[] {
  const tasksMap = tasksByBundleIds(bundles.map((b) => b.id));
  const authors = authorsById(bundles.map((b) => b.author_user_id));
  return bundles.map((bundle) => {
    const tasks = tasksMap.get(bundle.id) ?? [];
    return {
      ...bundle,
      categoryCount: tasks.length,
      availableCategories: CATEGORY_ORDER.filter((c) =>
        tasks.some((t) => t.category === c),
      ),
      taskCategories: tasks.map((t) => t.category),
      author: bundle.author_user_id
        ? authors.get(bundle.author_user_id) ?? null
        : null,
      quality: parseQuality(bundle.quality_json),
    };
  });
}

export function withBundleMeta(bundle: BundleRow): BundleListItem {
  return attachBundleMeta([bundle])[0]!;
}

export function listBundles(): BundleRow[] {
  return prepare(
    `SELECT ${BUNDLE_SELECT}
     FROM bundles ORDER BY created_at DESC`,
  ).all() as BundleRow[];
}

export function getBundleBySlugOrId(slugOrId: string): BundleRow | null {
  const row = prepare(
    `SELECT ${BUNDLE_SELECT}
     FROM bundles WHERE slug = ? OR id = ?`,
  ).get(slugOrId, slugOrId) as BundleRow | undefined;
  return row ?? null;
}

/** Canonical default = Octant; else oldest published official. */
export function getDefaultBundle(): BundleRow | null {
  const octant = prepare(
    `SELECT ${BUNDLE_SELECT}
      FROM bundles WHERE status = 'published' AND slug = ?`,
  ).get(DEFAULT_BUNDLE_SLUG) as BundleRow | undefined;
  if (octant) return octant;

  const row = prepare(
    `SELECT ${BUNDLE_SELECT}
      FROM bundles
      WHERE status = 'published' AND origin = 'official'
      ORDER BY created_at ASC LIMIT 1`,
  ).get() as BundleRow | undefined;
  return row ?? null;
}

/** Prefer Octant first, then official, then newest custom. */
export function sortBundlesForPicker(bundles: BundleRow[]): BundleRow[] {
  return [...bundles].sort((a, b) => {
    if (a.slug === DEFAULT_BUNDLE_SLUG && b.slug !== DEFAULT_BUNDLE_SLUG) return -1;
    if (b.slug === DEFAULT_BUNDLE_SLUG && a.slug !== DEFAULT_BUNDLE_SLUG) return 1;
    if (a.origin !== b.origin) return a.origin === "official" ? -1 : 1;
    return b.created_at - a.created_at;
  });
}

export function getBundleTasks(bundleId: string): TaskRow[] {
  return prepare(
    `SELECT ${TASK_SELECT}
     FROM tasks WHERE bundle_id = ? ORDER BY category ASC, rowid ASC`,
  ).all(bundleId) as TaskRow[];
}

export function parseMustMention(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
