import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getDb, prepare } from "@/lib/db";
import { getCachedModel, streamChat } from "@/lib/openrouter";
import {
  CATEGORY_ORDER,
  JudgeOutputSchema,
  judgeOutputJsonSchema,
  type Category,
  type JudgeOutput,
} from "@/lib/schemas";
import type { TaskSnapshot, ValidatorFinding } from "@/lib/validators";

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computedOverall(scores: {
  correctness: number;
  requirement_compliance: number;
  quality: number;
  honesty: number;
}): number {
  return mean([
    scores.correctness,
    scores.requirement_compliance,
    scores.quality,
    scores.honesty,
  ]);
}

export function renderValidatorBlock(findings: ValidatorFinding[]): string {
  const lines = findings.map((f) => {
    const mark = f.passed ? "PASS" : "FAIL";
    const detail = f.details ? ` — ${f.details}` : "";
    return `- [${mark}] ${f.validator}${detail}`;
  });
  return [
    "DETERMINISTIC VALIDATION RESULTS (trusted, computed by the harness — treat as ground truth):",
    ...lines,
    "Do not re-litigate these facts. Factor them into correctness and requirement_compliance.",
  ].join("\n");
}

export function aggregateTask(taskResultId: string): {
  median_overall: number;
  disagreement: number;
  flagged: boolean;
  judgeOveralls: number[];
} {
  const tr = prepare(
    `SELECT id, run_id, task_id, candidate_model_id, trial_index
     FROM task_results WHERE id = ?`,
  ).get(taskResultId) as
    | {
        id: string;
        run_id: string;
        task_id: string;
        candidate_model_id: string;
        trial_index: number;
      }
    | undefined;
  if (!tr) throw new Error(`task_result not found: ${taskResultId}`);

  const task = prepare(`SELECT category FROM tasks WHERE id = ?`).get(
    tr.task_id,
  ) as { category: string } | undefined;
  if (!task) throw new Error(`task not found for ${tr.task_id}`);

  const judgments = prepare(
    `SELECT id, server_overall, parse_status
     FROM judgment_attempts
     WHERE task_result_id = ? AND is_final = 1
     ORDER BY created_at ASC`,
  ).all(taskResultId) as Array<{
    id: string;
    server_overall: number | null;
    parse_status: string;
  }>;

  const valid = judgments.filter(
    (j) =>
      j.server_overall != null &&
      (j.parse_status === "first_try" || j.parse_status === "repaired"),
  );
  // Prefer a full panel of 3, but keep a score when reserves are exhausted and
  // one judge slot failed JSON — voiding the whole task throws away paid work.
  if (valid.length < 1 || valid.length > 3) {
    throw new Error(
      `aggregateTask requires 1–3 valid final judgments, got ${valid.length}`,
    );
  }

  const judgeOveralls = valid.map((j) => j.server_overall as number);
  const median_overall = median(judgeOveralls);
  const disagreement = Math.max(...judgeOveralls) - Math.min(...judgeOveralls);
  const flagged = disagreement > 3;

  const vr = prepare(
    `SELECT passed FROM validator_results WHERE task_result_id = ?`,
  ).all(taskResultId) as Array<{ passed: number }>;
  const validators_passed = vr.filter((v) => v.passed === 1).length;
  const validators_total = vr.length;

  prepare(`DELETE FROM task_scores WHERE task_result_id = ?`).run(taskResultId);
  prepare(
    `INSERT INTO task_scores (
      id, task_result_id, run_id, task_id, category, candidate_model_id,
      trial_index, judgment_ids_json, judge_overalls_json, median_overall,
      disagreement, validators_passed, validators_total, created_at
    ) VALUES (
      @id, @task_result_id, @run_id, @task_id, @category, @candidate_model_id,
      @trial_index, @judgment_ids_json, @judge_overalls_json, @median_overall,
      @disagreement, @validators_passed, @validators_total, @created_at
    )`,
  ).run({
    id: randomUUID(),
    task_result_id: taskResultId,
    run_id: tr.run_id,
    task_id: tr.task_id,
    category: task.category,
    candidate_model_id: tr.candidate_model_id,
    trial_index: tr.trial_index,
    judgment_ids_json: JSON.stringify(valid.map((j) => j.id)),
    judge_overalls_json: JSON.stringify(judgeOveralls),
    median_overall,
    disagreement,
    validators_passed,
    validators_total,
    created_at: Date.now(),
  });

  // Meta-scores for final judgments
  const findings = prepare(
    `SELECT validator, passed, expected_json, actual_json, details
     FROM validator_results WHERE task_result_id = ?`,
  ).all(taskResultId) as Array<{
    validator: string;
    passed: number;
    expected_json: string | null;
    actual_json: string | null;
    details: string;
  }>;
  const findingObjs: ValidatorFinding[] = findings.map((f) => ({
    validator: f.validator,
    passed: f.passed === 1,
    expected_json: f.expected_json,
    actual_json: f.actual_json,
    details: f.details,
  }));

  const finalAttempts = prepare(
    `SELECT * FROM judgment_attempts
     WHERE task_result_id = ? AND is_final = 1`,
  ).all(taskResultId) as Array<Record<string, unknown>>;

  const updateMeta = prepare(
    `UPDATE judgment_attempts SET calibration_score = @meta WHERE id = @id`,
  );
  for (const attempt of finalAttempts) {
    const meta = judgeMetaScore(attempt, findingObjs);
    updateMeta.run({ meta, id: attempt.id });
  }

  return { median_overall, disagreement, flagged, judgeOveralls };
}

export function finalizeRun(runId: string): {
  bundleRunScore: number | null;
  complete: boolean;
} {
  const run = prepare(
    `SELECT id, bundle_id, status, parameters_json, total_cost_usd
     FROM runs WHERE id = ?`,
  ).get(runId) as
    | {
        id: string;
        bundle_id: string;
        status: string;
        parameters_json: string;
        total_cost_usd: number;
      }
    | undefined;
  if (!run) throw new Error(`run not found: ${runId}`);

  const params = JSON.parse(run.parameters_json) as {
    categories?: Category[];
  };
  const categories = params.categories ?? CATEGORY_ORDER;
  const complete = run.status === "completed" && categories.length === 8;

  const candidates = prepare(
    `SELECT model_id FROM run_candidates WHERE run_id = ?`,
  ).all(runId) as Array<{ model_id: string }>;

  prepare(`DELETE FROM bundle_run_scores WHERE run_id = ?`).run(runId);

  const insert = prepare(
    `INSERT INTO bundle_run_scores (
      id, run_id, bundle_id, candidate_model_id, complete,
      category_scores_json, overall_score, total_cost_usd, avg_latency_ms, created_at
    ) VALUES (
      @id, @run_id, @bundle_id, @candidate_model_id, @complete,
      @category_scores_json, @overall_score, @total_cost_usd, @avg_latency_ms, @created_at
    )`,
  );

  let macroSum = 0;
  let macroCount = 0;

  for (const { model_id } of candidates) {
    const categoryScores: Record<string, number> = {};
    for (const cat of categories) {
      const trialMedians = prepare(
        `SELECT ts.median_overall
         FROM task_scores ts
         JOIN task_results tr ON tr.id = ts.task_result_id
         WHERE ts.run_id = ? AND ts.candidate_model_id = ? AND ts.category = ?
           AND tr.status = 'scored'`,
      ).all(runId, model_id, cat) as Array<{ median_overall: number }>;

      if (trialMedians.length > 0) {
        categoryScores[cat] = median(
          trialMedians.map((t) => t.median_overall),
        );
      }
    }

    const catValues = Object.values(categoryScores);
    const overall =
      complete && catValues.length === categories.length
        ? mean(catValues)
        : catValues.length > 0
          ? mean(catValues)
          : null;

    if (overall != null && complete) {
      macroSum += overall;
      macroCount += 1;
    }

    const latencyRow = prepare(
      `SELECT AVG(latency_ms) AS avg_lat FROM task_results
       WHERE run_id = ? AND candidate_model_id = ? AND latency_ms IS NOT NULL`,
    ).get(runId, model_id) as { avg_lat: number | null };

    const costRow = prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS c FROM task_results
       WHERE run_id = ? AND candidate_model_id = ?`,
    ).get(runId, model_id) as { c: number };

    insert.run({
      id: randomUUID(),
      run_id: runId,
      bundle_id: run.bundle_id,
      candidate_model_id: model_id,
      complete: complete ? 1 : 0,
      category_scores_json: JSON.stringify(categoryScores),
      overall_score:
        run.status === "cancelled" || run.status === "incomplete"
          ? null
          : overall,
      total_cost_usd: costRow.c,
      avg_latency_ms: latencyRow.avg_lat,
      created_at: Date.now(),
    });
  }

  // For incomplete/cancelled, force overall_score NULL and complete=0
  if (run.status !== "completed") {
    prepare(
      `UPDATE bundle_run_scores SET complete = 0, overall_score = NULL WHERE run_id = ?`,
    ).run(runId);
    return { bundleRunScore: null, complete: false };
  }

  return {
    bundleRunScore: macroCount > 0 ? macroSum / macroCount : null,
    complete,
  };
}

export interface LeaderboardRow {
  rank: number;
  model_id: string;
  score: number;
  provisional: boolean;
  complete_runs: number;
  disagreement_mean: number;
  success_rate: number;
  avg_cost_usd_per_run: number;
  avg_latency_ms: number;
  last_evaluated_at: string | null;
  spread_history: number[];
  category_medians: Record<string, number>;
  category_detail: Record<
    string,
    { median: number; spread: number; validator_pass_rate: number }
  >;
}

export function queryLeaderboard(
  bundleId: string,
  category?: Category,
): {
  bundle_id: string;
  bundle_hash: string;
  category: Category | null;
  rows: LeaderboardRow[];
} {
  const bundle = prepare(
    `SELECT id, content_hash, slug FROM bundles WHERE id = ? OR slug = ?`,
  ).get(bundleId, bundleId) as
    | { id: string; content_hash: string; slug: string }
    | undefined;
  if (!bundle) {
    throw new Error("BUNDLE_NOT_FOUND");
  }

  const completeScores = prepare(
    `SELECT brs.*, r.created_at AS run_created_at, r.bundle_hash
     FROM bundle_run_scores brs
     JOIN runs r ON r.id = brs.run_id
     WHERE brs.bundle_id = ? AND brs.complete = 1 AND brs.overall_score IS NOT NULL
     ORDER BY r.created_at ASC`,
  ).all(bundle.id) as Array<{
    run_id: string;
    candidate_model_id: string;
    overall_score: number;
    category_scores_json: string;
    total_cost_usd: number;
    avg_latency_ms: number | null;
    run_created_at: number;
    bundle_hash: string;
  }>;

  const byModel = new Map<string, typeof completeScores>();
  for (const row of completeScores) {
    const list = byModel.get(row.candidate_model_id) ?? [];
    list.push(row);
    byModel.set(row.candidate_model_id, list);
  }

  const rows: LeaderboardRow[] = [];

  for (const [model_id, runs] of byModel) {
    const scores = runs.map((r) => {
      if (category) {
        const cats = JSON.parse(r.category_scores_json) as Record<
          string,
          number
        >;
        return cats[category] ?? null;
      }
      return r.overall_score;
    });
    const usable = scores.filter((s): s is number => s != null);
    if (usable.length === 0) continue;

    const score = median(usable);
    const complete_runs = usable.length;

    // Ancillary stats across those runs
    const runIds = runs.map((r) => r.run_id);
    const placeholders = runIds.map(() => "?").join(",");

    const disagree = prepare(
      `SELECT AVG(disagreement) AS d FROM task_scores
       WHERE run_id IN (${placeholders}) AND candidate_model_id = ?`,
    ).get(...runIds, model_id) as { d: number | null };

    const success = prepare(
      `SELECT
         SUM(CASE WHEN status = 'scored' THEN 1 ELSE 0 END) AS scored,
         COUNT(*) AS attempted
       FROM task_results
       WHERE run_id IN (${placeholders}) AND candidate_model_id = ?`,
    ).get(...runIds, model_id) as { scored: number; attempted: number };

    const spread_history = runIds.map((rid) => {
      const row = prepare(
        `SELECT AVG(disagreement) AS d FROM task_scores
         WHERE run_id = ? AND candidate_model_id = ?`,
      ).get(rid, model_id) as { d: number | null };
      return row.d ?? 0;
    });

    const category_medians: Record<string, number> = {};
    const category_detail: LeaderboardRow["category_detail"] = {};
    for (const cat of CATEGORY_ORDER) {
      const catScores = runs
        .map((r) => {
          const cats = JSON.parse(r.category_scores_json) as Record<
            string,
            number
          >;
          return cats[cat];
        })
        .filter((n): n is number => typeof n === "number");
      if (catScores.length === 0) continue;
      const med = median(catScores);
      category_medians[cat] = med;

      const spreadRow = prepare(
        `SELECT AVG(disagreement) AS d,
                AVG(CAST(validators_passed AS REAL) / NULLIF(validators_total, 0)) AS vpr
         FROM task_scores
         WHERE run_id IN (${placeholders}) AND candidate_model_id = ? AND category = ?`,
      ).get(...runIds, model_id, cat) as {
        d: number | null;
        vpr: number | null;
      };
      category_detail[cat] = {
        median: med,
        spread: spreadRow.d ?? 0,
        validator_pass_rate: spreadRow.vpr ?? 0,
      };
    }

    const last = runs[runs.length - 1]!;
    rows.push({
      rank: 0,
      model_id,
      score,
      provisional: complete_runs < 3,
      complete_runs,
      disagreement_mean: disagree.d ?? 0,
      success_rate:
        success.attempted > 0 ? success.scored / success.attempted : 0,
      avg_cost_usd_per_run: mean(runs.map((r) => r.total_cost_usd)),
      avg_latency_ms: mean(
        runs.map((r) => r.avg_latency_ms ?? 0).filter((n) => n > 0),
      ),
      last_evaluated_at: new Date(last.run_created_at).toISOString(),
      spread_history,
      category_medians,
      category_detail,
    });
  }

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.complete_runs !== a.complete_runs)
      return b.complete_runs - a.complete_runs;
    return a.model_id.localeCompare(b.model_id);
  });
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  return {
    bundle_id: bundle.slug || bundle.id,
    bundle_hash: bundle.content_hash,
    category: category ?? null,
    rows,
  };
}

export function judgeMetaScore(
  attempt: Record<string, unknown>,
  findings: ValidatorFinding[],
): number {
  const parseStatus = String(attempt.parse_status ?? "invalid");
  const isSubstitute = Number(attempt.is_substitute ?? 0) === 1;
  const substitutedAway =
    isSubstitute && parseStatus === "invalid"
      ? false
      : // this judge was replaced: indicated by another attempt with substituted_for = this judge
        false;

  // parse quality
  let parseQuality = 0;
  if (parseStatus === "first_try") parseQuality = 10;
  else if (parseStatus === "repaired") parseQuality = 5;
  else if (substitutedAway || parseStatus === "invalid") parseQuality = 0;

  // If this attempt was the original that got replaced, calibration may still run on final.
  // Plan: substituted-away (this judge's slot replaced for invalid JSON) = 0
  // We detect via parse_status invalid on a non-final? For final invalid, 0.
  if (parseStatus === "invalid") parseQuality = 0;

  const answer =
    typeof attempt.candidate_answer === "string"
      ? attempt.candidate_answer
      : "";
  // Load candidate answer from task_result if not injected
  let candidateAnswer = answer;
  if (!candidateAnswer && typeof attempt.task_result_id === "string") {
    const tr = prepare(`SELECT raw_output FROM task_results WHERE id = ?`).get(
      attempt.task_result_id,
    ) as { raw_output: string | null } | undefined;
    candidateAnswer = tr?.raw_output ?? "";
  }

  const feedbackLists = [
    safeJsonArray(attempt.parsed_json, "what_was_good"),
    safeJsonArray(attempt.parsed_json, "what_was_terrible"),
    safeJsonArray(attempt.parsed_json, "what_was_missing"),
    safeJsonArray(attempt.parsed_json, "constraint_violations"),
    safeJsonArray(attempt.parsed_json, "critical_errors"),
  ];
  const allBullets = feedbackLists.flat();
  const referencing = allBullets.filter((b) => {
    if (b.length < 4) return false;
    if (candidateAnswer && candidateAnswer.includes(b.slice(0, 12)))
      return true;
    // validator reference
    return findings.some(
      (f) =>
        !f.passed &&
        (b.toLowerCase().includes(f.validator.replace(/_/g, " ")) ||
          b.toLowerCase().includes(f.validator)),
    );
  });
  let evidence = allBullets.length
    ? (referencing.length / allBullets.length) * 10
    : 0;

  const failed = findings.filter((f) => !f.passed);
  const acknowledgements = failed.filter((f) =>
    [...feedbackLists[3]!, ...feedbackLists[4]!].some(
      (b) =>
        b.toLowerCase().includes(f.validator.replace(/_/g, " ")) ||
        b.toLowerCase().includes(f.validator),
    ),
  ).length;
  evidence = Math.min(10, evidence + Math.min(2, acknowledgements));

  // feedback concreteness
  const cats = [
    safeJsonArray(attempt.parsed_json, "what_was_good"),
    safeJsonArray(attempt.parsed_json, "what_was_terrible"),
    safeJsonArray(attempt.parsed_json, "what_was_missing"),
  ];
  let concreteness = 10;
  for (const cat of cats) {
    const emptyOrFluff =
      cat.length === 0 || cat.every((b) => countWordsSimple(b) < 4);
    if (emptyOrFluff) concreteness -= 3.3;
  }
  concreteness = Math.max(0, concreteness);

  const claimed = Number(attempt.claimed_overall ?? 0);
  const computed = Number(attempt.server_overall ?? 0);
  const mismatch = Math.abs(claimed - computed);
  const consistency = Math.max(0, 10 - 2.5 * mismatch);

  return (
    0.25 * parseQuality +
    0.3 * evidence +
    0.25 * concreteness +
    0.2 * consistency
  );
}

function safeJsonArray(parsedJson: unknown, key: string): string[] {
  if (typeof parsedJson !== "string") return [];
  try {
    const obj = JSON.parse(parsedJson) as Record<string, unknown>;
    const arr = obj[key];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function countWordsSimple(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function estTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

export interface RunCostConfig {
  candidate_model_ids: string[];
  judge_pool_model_ids: string[];
  categories: Category[];
  trials_per_pair: number;
  candidate_concurrency: number;
  tasks: Array<{
    category: Category;
    wrapper: string;
    task_body: string;
    judge_prompt: string;
    token_limit: number;
  }>;
}

export function estimateTaskCost(
  task: {
    wrapper: string;
    task_body: string;
    judge_prompt: string;
    token_limit: number;
  },
  candidateModelId: string,
  judgeModelIds: string[],
): { expected: number; max: number } {
  const cand = getCachedModel(candidateModelId);
  const candPrompt = estTokens(task.wrapper + task.task_body);
  const candCompExp = 0.6 * task.token_limit;
  const candCompMax = task.token_limit;

  const costCall = (
    pricing: { prompt_usd_per_m: number; completion_usd_per_m: number } | null,
    prompt: number,
    completion: number,
  ) => {
    if (!pricing) return 0;
    return (
      (prompt * pricing.prompt_usd_per_m) / 1e6 +
      (completion * pricing.completion_usd_per_m) / 1e6
    );
  };

  let expected = costCall(cand?.pricing ?? null, candPrompt, candCompExp);
  let max = costCall(cand?.pricing ?? null, candPrompt, candCompMax);

  const validatorBlockEst = 200;
  for (const jid of judgeModelIds.slice(0, 3)) {
    const j = getCachedModel(jid);
    const jPrompt =
      estTokens(task.judge_prompt + task.wrapper + task.task_body) +
      validatorBlockEst +
      candCompExp;
    expected += costCall(j?.pricing ?? null, jPrompt, 700);
    max += costCall(j?.pricing ?? null, jPrompt, 1536);
  }
  return { expected, max };
}

export interface PreflightIssue {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export function evaluatePreflight(input: {
  bundle_id: string;
  candidate_model_ids: string[];
  judge_pool_model_ids: string[];
  categories: Category[];
  trials_per_pair: number;
  candidate_concurrency: number;
  budget_usd?: number | null;
  seed?: number;
}): {
  ok: boolean;
  seed: number;
  errors: PreflightIssue[];
  warnings: PreflightIssue[];
  estimate: ReturnType<typeof estimateRunCost>;
  bundle: {
    id: string;
    slug: string;
    content_hash: string;
    status: string;
  } | null;
  tasks: Array<{
    id: string;
    category: Category;
    wrapper: string;
    task_body: string;
    judge_prompt: string;
    output_schema: string;
    token_limit: number;
  }>;
} {
  const errors: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];
  const seed =
    input.seed ?? Math.floor(Math.random() * 0x7fffffff);

  const bundle = prepare(
    `SELECT id, slug, content_hash, status FROM bundles WHERE id = ? OR slug = ?`,
  ).get(input.bundle_id, input.bundle_id) as
    | { id: string; slug: string; content_hash: string; status: string }
    | undefined;

  if (!bundle) {
    errors.push({
      code: "BUNDLE_NOT_FOUND",
      message: `No bundle with id ${input.bundle_id}`,
    });
  } else if (bundle.status !== "published") {
    errors.push({
      code: "BUNDLE_NOT_PUBLISHED",
      message: `Bundle ${input.bundle_id} is not published`,
    });
  }

  const tasks = bundle
    ? (prepare(
        `SELECT id, category, wrapper, task_body, judge_prompt, output_schema, token_limit
         FROM tasks WHERE bundle_id = ?`,
      ).all(bundle.id) as Array<{
        id: string;
        category: Category;
        wrapper: string;
        task_body: string;
        judge_prompt: string;
        output_schema: string;
        token_limit: number;
      }>)
    : [];

  const includedTasks = tasks.filter((t) =>
    input.categories.includes(t.category),
  );
  const maxTask = includedTasks.reduce(
    (best, t) => {
      const promptEst = Math.ceil((t.wrapper.length + t.task_body.length) / 4);
      const need = promptEst + t.token_limit;
      return need > best.need ? { need, task: t } : best;
    },
    { need: 0, task: includedTasks[0] },
  );

  for (const id of [
    ...input.candidate_model_ids,
    ...input.judge_pool_model_ids,
  ]) {
    const m = getCachedModel(id);
    if (!m) {
      errors.push({
        code: "MODEL_UNAVAILABLE",
        message: `Model ${id} not found in catalog`,
        details: { model_id: id },
      });
      continue;
    }
    if (maxTask.task && m.context_length > 0 && m.context_length < maxTask.need) {
      errors.push({
        code: "CONTEXT_TOO_SMALL",
        message: `Model ${id} context_length ${m.context_length} < required ${maxTask.need}`,
        details: { model_id: id, required: maxTask.need },
      });
    }
  }

  const overlap = input.candidate_model_ids.filter((c) =>
    input.judge_pool_model_ids.includes(c),
  );
  const minPool = overlap.length > 0 ? 4 : 3;
  if (input.judge_pool_model_ids.length < minPool) {
    errors.push({
      code: "JUDGE_POOL_TOO_SMALL",
      message:
        overlap.length > 0
          ? "Judge pool must have at least 4 models when candidates overlap (reserve required)"
          : "Judge pool must have at least 3 models",
    });
  }

  for (const model_id of overlap) {
    warnings.push({
      code: "SELF_JUDGING_OVERLAP",
      message: `${model_id} is both a candidate and a judge; a seeded reserve will replace it when judging its own answers.`,
      details: { model_id },
    });
  }

  for (const jid of input.judge_pool_model_ids) {
    const m = getCachedModel(jid);
    if (m && !m.supports_structured_outputs) {
      warnings.push({
        code: "JUDGE_NO_STRUCTURED_OUTPUT",
        message: `${jid} does not advertise structured outputs; schema-retry path will be used.`,
        details: { model_id: jid },
      });
    }
  }

  const estimate = estimateRunCost({
    candidate_model_ids: input.candidate_model_ids,
    judge_pool_model_ids: input.judge_pool_model_ids,
    categories: input.categories,
    trials_per_pair: input.trials_per_pair,
    candidate_concurrency: input.candidate_concurrency,
    tasks: includedTasks.map((t) => ({
      category: t.category,
      wrapper: t.wrapper,
      task_body: t.task_body,
      judge_prompt: t.judge_prompt,
      token_limit: t.token_limit,
    })),
  });

  if (
    input.budget_usd != null &&
    estimate.cost_usd_max > input.budget_usd
  ) {
    warnings.push({
      code: "ESTIMATE_EXCEEDS_BUDGET",
      message: `Estimated max cost $${estimate.cost_usd_max.toFixed(2)} exceeds budget $${input.budget_usd}`,
    });
  }

  return {
    ok: errors.length === 0,
    seed,
    errors,
    warnings,
    estimate,
    bundle: bundle ?? null,
    tasks: includedTasks,
  };
}

export function estimateRunCost(config: RunCostConfig): {
  request_count: number;
  candidate_requests: number;
  judge_requests: number;
  prompt_tokens_est: number;
  completion_tokens_est: number;
  cost_usd_min: number;
  cost_usd_expected: number;
  cost_usd_max: number;
  duration_est_seconds: number;
  unpriced_models: string[];
} {
  const candidate_requests =
    config.candidate_model_ids.length *
    config.categories.length *
    config.trials_per_pair;
  const judge_requests = 3 * candidate_requests;
  const request_count = candidate_requests + judge_requests;

  const unpriced = new Set<string>();
  for (const id of [
    ...config.candidate_model_ids,
    ...config.judge_pool_model_ids,
  ]) {
    if (!getCachedModel(id)?.pricing) unpriced.add(id);
  }

  let cost_usd_expected = 0;
  let cost_usd_min = 0;
  let cost_usd_max = 0;
  let prompt_tokens_est = 0;
  let completion_tokens_est = 0;

  const tasksByCat = new Map(
    config.tasks.map((t) => [t.category, t] as const),
  );

  for (const cand of config.candidate_model_ids) {
    for (const cat of config.categories) {
      const task = tasksByCat.get(cat);
      if (!task) continue;
      for (let trial = 0; trial < config.trials_per_pair; trial++) {
        const judges = config.judge_pool_model_ids.slice(0, 3);
        const { expected, max } = estimateTaskCost(task, cand, judges);

        // min uses 0.25 × token_limit completions for candidate
        const candModel = getCachedModel(cand);
        const candPrompt = estTokens(task.wrapper + task.task_body);
        const minCand =
          candModel?.pricing
            ? (candPrompt * candModel.pricing.prompt_usd_per_m) / 1e6 +
              (0.25 * task.token_limit * candModel.pricing.completion_usd_per_m) /
                1e6
            : 0;
        let minJudges = 0;
        for (const jid of judges) {
          const j = getCachedModel(jid);
          const jPrompt =
            estTokens(task.judge_prompt + task.wrapper + task.task_body) +
            200 +
            0.25 * task.token_limit;
          if (j?.pricing) {
            minJudges +=
              (jPrompt * j.pricing.prompt_usd_per_m) / 1e6 +
              (700 * j.pricing.completion_usd_per_m) / 1e6;
          }
        }

        cost_usd_expected += expected;
        cost_usd_min += minCand + minJudges;
        cost_usd_max += max;
        prompt_tokens_est += candPrompt + 3 * (candPrompt + 200);
        completion_tokens_est += 0.6 * task.token_limit + 3 * 700;
      }
    }
  }

  cost_usd_max *= 1.35;

  const duration_est_seconds =
    (candidate_requests * 35) / config.candidate_concurrency +
    candidate_requests * 20;

  return {
    request_count,
    candidate_requests,
    judge_requests,
    prompt_tokens_est: Math.round(prompt_tokens_est),
    completion_tokens_est: Math.round(completion_tokens_est),
    cost_usd_min,
    cost_usd_expected,
    cost_usd_max,
    duration_est_seconds: Math.round(duration_est_seconds),
    unpriced_models: [...unpriced],
  };
}

export interface CalibrationFixture {
  id: string;
  category: Category;
  task_snapshot: TaskSnapshot;
  candidate_answer: string;
  validator_findings: ValidatorFinding[];
  human: {
    expected_verdict: "pass" | "partial_pass" | "fail";
    expected_overall_range: [number, number];
    must_flag: string[];
  };
}

export function loadCalibrationFixtures(): CalibrationFixture[] {
  const dir = path.join(process.cwd(), "lib", "fixtures", "calibration");
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.map((f) => {
    const raw = readFileSync(path.join(dir, f), "utf8");
    return JSON.parse(raw) as CalibrationFixture;
  });
}

export async function runCalibration(
  judgeModelId: string,
  signal?: AbortSignal,
): Promise<{ written: number }> {
  const fixtures = loadCalibrationFixtures();
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO judge_calibration_results (
      id, fixture, judge_model_id, evidence_quality, consistency,
      correctness, parse_status, raw_output, created_at
    ) VALUES (
      @id, @fixture, @judge_model_id, @evidence_quality, @consistency,
      @correctness, @parse_status, @raw_output, @created_at
    )`,
  );

  let written = 0;
  for (const fixture of fixtures) {
    const block = renderValidatorBlock(fixture.validator_findings);
    const user = [
      `ORIGINAL TASK:\n${fixture.task_snapshot.task_body ?? ""}`,
      block,
      `CANDIDATE ANSWER:\n${fixture.candidate_answer}`,
    ].join("\n\n");

    let raw = "";
    let parse_status: "first_try" | "repaired" | "invalid" = "invalid";
    let parsed: JudgeOutput | null = null;

    try {
      const result = await streamChat({
        model: judgeModelId,
        messages: [
          {
            role: "system",
            content: "You are an independent benchmark judge.",
          },
          { role: "user", content: user },
        ],
        temperature: 0,
        maxTokens: 1536,
        responseFormat: {
          name: "judge_output",
          schema: judgeOutputJsonSchema,
        },
        signal: signal ?? new AbortController().signal,
        onDelta: () => undefined,
        allowRetryAfterPartial: true,
        deadlineMs: 240_000,
      });
      raw = result.text;
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const json = JSON.parse(cleaned);
      const safe = JudgeOutputSchema.safeParse(json);
      if (safe.success) {
        parsed = safe.data;
        parse_status = "first_try";
      }
    } catch {
      parse_status = "invalid";
    }

    let correctness = 0;
    let evidence_quality = 0;
    let consistency = 0;

    if (parsed) {
      const overall = computedOverall(parsed.scores);
      const [lo, hi] = fixture.human.expected_overall_range;
      const verdictOk = parsed.verdict === fixture.human.expected_verdict;
      const inRange = overall >= lo && overall <= hi;
      if (verdictOk && inRange) correctness = 10;
      else if (verdictOk) {
        const dist = overall < lo ? lo - overall : overall - hi;
        correctness = Math.max(0, 10 - dist * 2);
      } else {
        correctness = Math.max(0, 3 - Math.abs(overall - (lo + hi) / 2));
      }

      const flags = [
        ...parsed.constraint_violations,
        ...parsed.critical_errors,
      ].join(" ").toLowerCase();
      const flagged = fixture.human.must_flag.filter((m) =>
        flags.includes(m.toLowerCase()),
      );
      const flagRatio =
        fixture.human.must_flag.length === 0
          ? 1
          : flagged.length / fixture.human.must_flag.length;
      correctness *= flagRatio;

      const attempt = {
        parse_status,
        claimed_overall: parsed.overall_score,
        server_overall: overall,
        parsed_json: JSON.stringify(parsed),
        candidate_answer: fixture.candidate_answer,
        is_substitute: 0,
      };
      const meta = judgeMetaScore(attempt, fixture.validator_findings);
      evidence_quality = meta; // roll into storage fields
      consistency = Math.max(
        0,
        10 - 2.5 * Math.abs(parsed.overall_score - overall),
      );
    }

    insert.run({
      id: randomUUID(),
      fixture: fixture.id,
      judge_model_id: judgeModelId,
      evidence_quality,
      consistency,
      correctness,
      parse_status,
      raw_output: raw,
      created_at: Date.now(),
    });
    written += 1;
  }

  return { written };
}

/** Judge rollups for /judges analytics. */
export function queryJudgeRollups(bundleId?: string): Array<{
  judge_model_id: string;
  harshness_offset: number;
  variance: number;
  parse_fail_rate: number;
  mean_meta_score: number;
  mean_claim_mismatch: number;
  substitution_count: number;
  judgment_count: number;
}> {
  void bundleId;
  const rows = prepare(
    `SELECT judge_model_id,
            AVG(server_overall) AS avg_score,
            AVG(calibration_score) AS mean_meta,
            AVG(ABS(COALESCE(claimed_overall,0) - COALESCE(server_overall,0))) AS mean_mismatch,
            SUM(CASE WHEN parse_status != 'first_try' THEN 1 ELSE 0 END) AS parse_issues,
            SUM(CASE WHEN is_substitute = 1 THEN 1 ELSE 0 END) AS subs,
            COUNT(*) AS n
     FROM judgment_attempts
     WHERE is_final = 1
     GROUP BY judge_model_id`,
  ).all() as Array<{
    judge_model_id: string;
    avg_score: number | null;
    mean_meta: number | null;
    mean_mismatch: number | null;
    parse_issues: number;
    subs: number;
    n: number;
  }>;

  return rows.map((r) => {
    // Offset vs panel median approximated as 0 when panel context unavailable in aggregate
    const offsets = prepare(
      `SELECT ja.server_overall AS s, ts.median_overall AS m
       FROM judgment_attempts ja
       JOIN task_scores ts ON ts.task_result_id = ja.task_result_id
       WHERE ja.judge_model_id = ? AND ja.is_final = 1 AND ja.server_overall IS NOT NULL`,
    ).all(r.judge_model_id) as Array<{ s: number; m: number }>;
    const diffs = offsets.map((o) => o.s - o.m);
    const offset = mean(diffs);
    const variance =
      diffs.length > 0
        ? mean(diffs.map((d) => (d - offset) ** 2))
        : 0;

    return {
      judge_model_id: r.judge_model_id,
      harshness_offset: offset,
      variance,
      parse_fail_rate: r.n > 0 ? r.parse_issues / r.n : 0,
      mean_meta_score: r.mean_meta ?? 0,
      mean_claim_mismatch: r.mean_mismatch ?? 0,
      substitution_count: r.subs,
      judgment_count: r.n,
    };
  });
}
