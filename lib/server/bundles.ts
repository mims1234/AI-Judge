import { prepare } from "@/lib/db";
import type { Category } from "@/lib/schemas";

/**
 * Server-only bundle reads for /bundles and the run wizard (plans/08 §3).
 * Bundle content is immutable and local — direct SQLite reads.
 */

export type BundleRow = {
  id: string;
  name: string;
  version: string;
  slug: string;
  content_hash: string;
  status: "draft" | "published" | "deprecated";
  changelog: string;
  created_at: number;
};

export type TaskRow = {
  id: string;
  bundle_id: string;
  category: Category;
  wrapper: string;
  task_body: string;
  judge_prompt: string;
  output_schema: string; // JSON string
  token_limit: number;
  weight: number;
};

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

export function getDefaultBundle(): BundleRow | null {
  const row = prepare(
    `SELECT id, name, version, slug, content_hash, status, changelog, created_at
     FROM bundles WHERE status = 'published' ORDER BY created_at DESC LIMIT 1`,
  ).get() as BundleRow | undefined;
  return row ?? null;
}

export function getBundleTasks(bundleId: string): TaskRow[] {
  return prepare(
    `SELECT id, bundle_id, category, wrapper, task_body, judge_prompt, output_schema, token_limit, weight
     FROM tasks WHERE bundle_id = ? ORDER BY category ASC`,
  ).all(bundleId) as TaskRow[];
}
