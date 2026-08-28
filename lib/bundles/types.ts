import type { Category } from "@/lib/schemas";
import type { PackReview } from "@/lib/bundles/custom";

/**
 * Shared bundle shapes — safe for client + server.
 * Keep SQLite access in `lib/server/bundles.ts` only.
 */

export type BundleOrigin = "official" | "custom";

export type BundleRow = {
  id: string;
  name: string;
  version: string;
  slug: string;
  content_hash: string;
  status: "draft" | "published" | "deprecated";
  changelog: string;
  created_at: number;
  origin: BundleOrigin;
  brief: string | null;
  reference_notes: string | null;
  generator_model_id: string | null;
  author_user_id: string | null;
  quality_json: string | null;
};

export type BundleAuthor = {
  id: string;
  username: string;
  avatar_url: string | null;
};

export type BundleListItem = BundleRow & {
  categoryCount: number;
  availableCategories: Category[];
  /** One entry per task, in pack order — types may repeat. */
  taskCategories: Category[];
  author: BundleAuthor | null;
  quality: PackReview | null;
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
  must_mention_json: string;
};

export const BUNDLE_SELECT = `id, name, version, slug, content_hash, status, changelog, created_at,
      origin, brief, reference_notes, generator_model_id, author_user_id, quality_json`;

export const TASK_SELECT = `id, bundle_id, category, wrapper, task_body, judge_prompt, output_schema, token_limit, weight, must_mention_json`;
