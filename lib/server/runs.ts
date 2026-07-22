import "server-only";

import { prepare } from "@/lib/db";
import type { RunStatus } from "@/lib/schemas";

export type RunListItem = {
  id: string;
  bundle_slug: string;
  status: RunStatus;
  created_at: number;
  finished_at: number | null;
  total_cost_usd: number;
  candidate_count: number;
  scored_count: number;
  error_count: number;
  task_total: number;
};

/** Recent runs for the /runs history page. */
export function listRuns(limit = 50): RunListItem[] {
  const rows = prepare(
    `SELECT r.id, r.bundle_id, r.status, r.created_at, r.finished_at, r.total_cost_usd,
            (SELECT slug FROM bundles b WHERE b.id = r.bundle_id) AS bundle_slug,
            (SELECT COUNT(*) FROM run_candidates rc WHERE rc.run_id = r.id) AS candidate_count,
            (SELECT COUNT(*) FROM task_results tr WHERE tr.run_id = r.id) AS task_total,
            (SELECT COUNT(*) FROM task_results tr WHERE tr.run_id = r.id AND tr.status = 'scored') AS scored_count,
            (SELECT COUNT(*) FROM task_results tr WHERE tr.run_id = r.id AND tr.status = 'error') AS error_count
     FROM runs r
     ORDER BY r.created_at DESC
     LIMIT ?`,
  ).all(limit) as Array<{
    id: string;
    bundle_id: string;
    status: RunStatus;
    created_at: number;
    finished_at: number | null;
    total_cost_usd: number;
    bundle_slug: string | null;
    candidate_count: number;
    task_total: number;
    scored_count: number;
    error_count: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    bundle_slug: r.bundle_slug ?? r.bundle_id,
    status: r.status,
    created_at: r.created_at,
    finished_at: r.finished_at,
    total_cost_usd: r.total_cost_usd,
    candidate_count: r.candidate_count,
    scored_count: r.scored_count,
    error_count: r.error_count,
    task_total: r.task_total,
  }));
}
