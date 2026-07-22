import { randomUUID } from "node:crypto";
import { apiError, isoFromMs, parseBody, parseQuery } from "@/lib/api-helpers";
import { getDb, prepare } from "@/lib/db";
import { getCachedModel, getModelCatalog, hasApiKey } from "@/lib/openrouter";
import { getRunEngine, selectPanels } from "@/lib/run-engine";
import {
  CreateRunRequestSchema,
  RunListQuerySchema,
  type Category,
} from "@/lib/schemas";
import { evaluatePreflight } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = parseQuery(RunListQuerySchema, url.searchParams);
    if (!parsed.ok) return parsed.response;

    const { status, limit } = parsed.data;
    const rows = status
      ? (prepare(
          `SELECT id, bundle_id, status, created_at, total_cost_usd
           FROM runs WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
        ).all(status, limit) as Array<{
          id: string;
          bundle_id: string;
          status: string;
          created_at: number;
          total_cost_usd: number;
        }>)
      : (prepare(
          `SELECT id, bundle_id, status, created_at, total_cost_usd
           FROM runs ORDER BY created_at DESC LIMIT ?`,
        ).all(limit) as Array<{
          id: string;
          bundle_id: string;
          status: string;
          created_at: number;
          total_cost_usd: number;
        }>);

    // Resolve bundle slug for display id if possible
    const runs = rows.map((r) => {
      const b = prepare(`SELECT slug FROM bundles WHERE id = ?`).get(
        r.bundle_id,
      ) as { slug: string } | undefined;
      return {
        id: r.id,
        bundle_id: b?.slug ?? r.bundle_id,
        status: r.status,
        created_at: isoFromMs(r.created_at)!,
        total_cost_usd: r.total_cost_usd,
      };
    });

    return Response.json({ runs });
  } catch (err) {
    console.error("[api/runs GET]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}

export async function POST(request: Request) {
  try {
    if (!hasApiKey()) {
      return apiError(
        "NO_API_KEY",
        503,
        "OPENROUTER_API_KEY is not configured",
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", 400, "Invalid JSON body");
    }

    const parsed = parseBody(CreateRunRequestSchema, raw);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    // Idempotency: look for existing run with same key in parameters_json
    if (body.idempotency_key) {
      const existing = prepare(
        `SELECT id, status FROM runs
         WHERE json_extract(parameters_json, '$.idempotency_key') = ?
         ORDER BY created_at DESC LIMIT 1`,
      ).get(body.idempotency_key) as
        | { id: string; status: string }
        | undefined;
      if (existing) {
        return Response.json(
          {
            run_id: existing.id,
            status: "queued" as const,
            events_url: `/api/runs/${existing.id}/events`,
          },
          { status: 201 },
        );
      }
    }

    await getModelCatalog();
    const preflight = evaluatePreflight(body);
    if (!preflight.ok || !preflight.bundle) {
      if (!preflight.bundle) {
        return apiError(
          "BUNDLE_NOT_FOUND",
          404,
          `No bundle with id ${body.bundle_id}`,
        );
      }
      return apiError(
        "PREFLIGHT_FAILED",
        409,
        "Preflight checks failed",
        preflight.errors,
      );
    }

    const runId = randomUUID();
    const pricing_snapshot: Record<string, unknown> = {};
    for (const id of [
      ...body.candidate_model_ids,
      ...body.judge_pool_model_ids,
    ]) {
      pricing_snapshot[id] = getCachedModel(id);
    }

    const frozenTasks = preflight.tasks.map((t) => ({
      id: t.id,
      category: t.category as Category,
      wrapper: t.wrapper,
      task_body: t.task_body,
      judge_prompt: t.judge_prompt,
      output_schema: JSON.parse(t.output_schema) as Record<string, unknown>,
      token_limit: t.token_limit,
    }));

    const parameters = {
      ...body,
      tasks: frozenTasks,
      pricing_snapshot,
      estimate: preflight.estimate,
    };

    const panels = selectPanels(
      body.seed,
      body.judge_pool_model_ids,
      body.categories as Category[],
    );

    const db = getDb();
    const now = Date.now();

    db.transaction(() => {
      prepare(
        `INSERT INTO runs (
          id, bundle_id, bundle_hash, seed, status, parameters_json,
          budget_usd, trials, total_cost_usd, last_event_id, created_at
        ) VALUES (
          @id, @bundle_id, @bundle_hash, @seed, 'queued', @parameters_json,
          @budget_usd, @trials, 0, 0, @created_at
        )`,
      ).run({
        id: runId,
        bundle_id: preflight.bundle!.id,
        bundle_hash: preflight.bundle!.content_hash,
        seed: body.seed,
        parameters_json: JSON.stringify(parameters),
        budget_usd: body.budget_usd ?? null,
        trials: body.trials_per_pair,
        created_at: now,
      });

      const insCand = prepare(
        `INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`,
      );
      for (const model_id of body.candidate_model_ids) {
        insCand.run(runId, model_id);
      }

      const insJudge = prepare(
        `INSERT INTO run_judge_pool (run_id, model_id) VALUES (?, ?)`,
      );
      for (const model_id of body.judge_pool_model_ids) {
        insJudge.run(runId, model_id);
      }

      const insPanel = prepare(
        `INSERT INTO category_judge_panels (
          run_id, category, panel_seed, judge_model_id, panel_position, reserve_order
        ) VALUES (
          @run_id, @category, @panel_seed, @judge_model_id, @panel_position, @reserve_order
        )`,
      );
      for (const row of panels.rows) {
        insPanel.run({
          run_id: runId,
          category: row.category,
          panel_seed: row.panel_seed,
          judge_model_id: row.judge_model_id,
          panel_position: row.panel_position,
          reserve_order: row.reserve_order,
        });
      }

      const insTr = prepare(
        `INSERT INTO task_results (
          id, run_id, task_id, candidate_model_id, trial_index, status
        ) VALUES (?, ?, ?, ?, ?, 'pending')`,
      );
      for (const cand of body.candidate_model_ids) {
        for (const task of frozenTasks) {
          for (let trial = 0; trial < body.trials_per_pair; trial++) {
            insTr.run(randomUUID(), runId, task.id, cand, trial);
          }
        }
      }
    })();

    getRunEngine().enqueue(runId);

    return Response.json(
      {
        run_id: runId,
        status: "queued" as const,
        events_url: `/api/runs/${runId}/events`,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api/runs POST]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
