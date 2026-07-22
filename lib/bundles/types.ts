import type { Category } from "@/lib/schemas";

/**
 * Shared bundle shapes — safe for client + server.
 * Keep SQLite access in `lib/server/bundles.ts` only.
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
