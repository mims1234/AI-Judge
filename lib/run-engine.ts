import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  MODEL_NAMES_MASKED_NOTE,
  findModelMention,
  maskModelMentions,
} from "@/lib/blind";
import { withJudgeEnglishOnly } from "@/lib/bundles/judge-language";
import { getDb, prepare } from "@/lib/db";
import {
  OpenRouterError,
  resolveApiKey,
  streamChat,
  type StreamChatResult,
} from "@/lib/openrouter";
import { hash32, seededShuffle } from "@/lib/prng";
import {
  JUDGE_MAX_TOKENS,
  PLATFORM_TRUNCATION_NOTE,
  parseJudgeOutput,
} from "@/lib/judge-parse";
import {
  CATEGORY_ORDER,
  EPHEMERAL_SSE_EVENTS,
  judgeOutputJsonSchema,
  type Category,
  type JudgeOutput,
} from "@/lib/schemas";
import {
  getAppSettings,
  getCallDeadlineMs,
  getMaxRetries,
} from "@/lib/server/appSettings";
import {
  aggregateTask,
  estimateTaskCost,
  finalizeRun,
  renderValidatorBlock,
} from "@/lib/scoring";
import {
  isCountableFinding,
  runValidators,
  stripThinkTags,
  type TaskSnapshot,
} from "@/lib/validators";

export class InvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStateError";
  }
}

export interface PanelRow {
  category: Category;
  panel_seed: number;
  judge_model_id: string;
  panel_position: number | null;
  reserve_order: number | null;
}

export interface SelectPanelsResult {
  rows: PanelRow[];
}

export function selectPanels(
  seed: number,
  judgePool: string[],
  categories: Category[],
): SelectPanelsResult {
  const rows: PanelRow[] = [];
  const ordered = CATEGORY_ORDER.filter((c) => categories.includes(c));

  for (const category of ordered) {
    const panel_seed = hash32(`${seed}:${category}`);
    const shuffled = seededShuffle(judgePool, panel_seed);

    // Soft family-diversity post-pass
    if (shuffled.length >= 3) {
      const top3 = shuffled.slice(0, 3);
      const prefixes = top3.map((id) => id.split("/")[0] ?? id);
      const counts = new Map<string, number>();
      for (const p of prefixes) counts.set(p, (counts.get(p) ?? 0) + 1);
      const crowded = [...counts.entries()].find(([, n]) => n >= 2);
      if (crowded) {
        const crowdedPrefix = crowded[0];
        const swapIdx = shuffled.findIndex(
          (id, i) => i >= 3 && (id.split("/")[0] ?? id) !== crowdedPrefix,
        );
        if (swapIdx !== -1) {
          // Swap the last crowded slot (prefer position 2) with later diverse judge
          let target = 2;
          if ((shuffled[2]!.split("/")[0] ?? "") !== crowdedPrefix) {
            target = top3.findIndex(
              (id) => (id.split("/")[0] ?? id) === crowdedPrefix,
            );
          }
          if (target >= 0) {
            const tmp = shuffled[target]!;
            shuffled[target] = shuffled[swapIdx]!;
            shuffled[swapIdx] = tmp;
          }
        }
      }
    }

    shuffled.forEach((judge_model_id, i) => {
      if (i < 3) {
        rows.push({
          category,
          panel_seed,
          judge_model_id,
          panel_position: i,
          reserve_order: null,
        });
      } else {
        rows.push({
          category,
          panel_seed,
          judge_model_id,
          panel_position: null,
          reserve_order: i - 3,
        });
      }
    });
  }

  return { rows };
}

type ControlBlock = {
  pauseRequested: boolean;
  /** The paused status + notice were already written for this pause. */
  pauseAnnounced: boolean;
  cancelRequested: boolean;
  /**
   * Work appeared while the executor was mid-pass (a task retry, or a resume
   * before the run finished winding down): make one more pass before finalizing.
   */
  rerunRequested: boolean;
  abortController: AbortController;
};

type EngineEvent = {
  id?: number;
  type: string;
  payload: unknown;
};

export interface RunEngine {
  /** Queue a run. Optional apiKey is held in-memory for the run lifetime (never SQLite). */
  enqueue(runId: string, apiKey?: string | null): void;
  /** Bind/replace the in-memory OpenRouter key for a run (resume / retry / idempotent relaunch). */
  bindApiKey(runId: string, apiKey?: string | null): void;
  pause(runId: string): void;
  resume(runId: string): void;
  cancel(runId: string): void;
  retryTask(runId: string, taskResultId: string): void;
  events(runId: string): EventEmitter;
}

type GlobalEngine = {
  __aiJudgeEngine?: RunEngineImpl;
};

class RunEngineImpl implements RunEngine {
  private queue: string[] = [];
  private activeRunId: string | null = null;
  private workerBusy = false;
  private controls = new Map<string, ControlBlock>();
  private emitters = new Map<string, EventEmitter>();
  /** In-memory BYOK keys — never persisted to SQLite. */
  private runKeys = new Map<string, string>();
  private recovered = false;

  constructor() {
    this.recover();
  }

  bindApiKey(runId: string, apiKey?: string | null): void {
    if (apiKey && apiKey.trim()) {
      this.runKeys.set(runId, apiKey.trim());
    }
  }

  /** Resolve key for a run: bound user key, else non-prod env fallback. */
  private resolveRunKey(runId: string): string | null {
    return resolveApiKey(this.runKeys.get(runId) ?? null);
  }

  private ensureControl(runId: string): ControlBlock {
    let c = this.controls.get(runId);
    if (!c) {
      c = {
        pauseRequested: false,
        pauseAnnounced: false,
        cancelRequested: false,
        rerunRequested: false,
        abortController: new AbortController(),
      };
      this.controls.set(runId, c);
    }
    return c;
  }

  events(runId: string): EventEmitter {
    let ee = this.emitters.get(runId);
    if (!ee) {
      ee = new EventEmitter();
      ee.setMaxListeners(50);
      this.emitters.set(runId, ee);
    }
    return ee;
  }

  emitEvent(runId: string, type: string, payload: unknown): EngineEvent {
    const ephemeral = EPHEMERAL_SSE_EVENTS.has(type);
    let id: number | undefined;
    if (!ephemeral) {
      const info = prepare(
        `INSERT INTO run_events (run_id, type, payload, created_at)
         VALUES (@run_id, @type, @payload, @created_at)`,
      ).run({
        run_id: runId,
        type,
        payload: JSON.stringify(payload),
        created_at: Date.now(),
      });
      id = Number(info.lastInsertRowid);
      prepare(`UPDATE runs SET last_event_id = ? WHERE id = ?`).run(id, runId);
    }
    const evt: EngineEvent = { id, type, payload };
    this.events(runId).emit("event", evt);
    return evt;
  }

  private recover(): void {
    if (this.recovered) return;
    this.recovered = true;

    // Reset streaming → pending (partial text never persisted)
    prepare(
      `UPDATE task_results SET status = 'pending'
       WHERE status = 'streaming'`,
    ).run();

    const rows = prepare(
      `SELECT id, status FROM runs
       WHERE status IN ('running', 'queued')
       ORDER BY created_at ASC`,
    ).all() as Array<{ id: string; status: string }>;

    const running = rows.filter((r) => r.status === "running");
    const queued = rows.filter((r) => r.status === "queued");
    for (const r of [...running, ...queued]) {
      this.rescueSalvageableJudgingFailures(r.id);
      if (!this.queue.includes(r.id)) this.queue.push(r.id);
    }
    void this.pump();
  }

  /**
   * Re-score tasks that were voided as judging_failure even though ≥1 judge
   * returned valid JSON (common with a 3-judge pool and no reserves).
   */
  private rescueSalvageableJudgingFailures(runId: string): void {
    const errored = prepare(
      `SELECT id, error FROM task_results
       WHERE run_id = ? AND status = 'error'`,
    ).all(runId) as Array<{ id: string; error: string | null }>;

    for (const row of errored) {
      let kind: string | undefined;
      try {
        kind = row.error
          ? (JSON.parse(row.error) as { kind?: string }).kind
          : undefined;
      } catch {
        continue;
      }
      if (kind !== "judging_failure") continue;

      const validCount = (
        prepare(
          `SELECT COUNT(*) AS n FROM judgment_attempts
           WHERE task_result_id = ? AND is_final = 1
             AND parse_status IN ('first_try','repaired')
             AND server_overall IS NOT NULL`,
        ).get(row.id) as { n: number }
      ).n;
      if (validCount < 1) continue;

      try {
        const agg = aggregateTask(row.id);
        const meta = prepare(
          `SELECT tr.task_id, tr.candidate_model_id, tr.trial_index, t.category
           FROM task_results tr
           JOIN tasks t ON t.id = tr.task_id
           WHERE tr.id = ?`,
        ).get(row.id) as {
          task_id: string;
          candidate_model_id: string;
          trial_index: number;
          category: Category;
        };

        prepare(
          `UPDATE task_results SET status = 'scored', error = NULL, finished_at = ?
           WHERE id = ?`,
        ).run(Date.now(), row.id);

        this.emitEvent(runId, "notice", {
          runId,
          scope: "task",
          code: "PARTIAL_JUDGE_PANEL",
          message: `Rescued score from ${validCount}/3 valid judgments`,
          taskResultId: row.id,
          details: { validCount, expected: 3, rescued: true },
        });
        this.emitEvent(runId, "task.scored", {
          runId,
          taskResultId: row.id,
          taskId: meta.task_id,
          category: meta.category,
          candidateModelId: meta.candidate_model_id,
          trialIndex: meta.trial_index,
          median: agg.median_overall,
          disagreement: agg.disagreement,
          flagged: agg.flagged,
          judgeOveralls: agg.judgeOveralls,
        });
        this.emitTaskStatus(runId, row.id, "scored");
      } catch (err) {
        console.error(
          "[run-engine] rescueSalvageableJudgingFailures failed",
          row.id,
          err,
        );
      }
    }
  }

  enqueue(runId: string, apiKey?: string | null): void {
    this.bindApiKey(runId, apiKey);
    if (!this.queue.includes(runId) && this.activeRunId !== runId) {
      this.queue.push(runId);
    }
    void this.pump();
  }

  pause(runId: string): void {
    const run = this.getRun(runId);
    if (run.status !== "queued" && run.status !== "running") {
      throw new InvalidStateError(
        `cannot pause a run in status ${run.status}`,
      );
    }
    if (run.status === "queued") {
      this.queue = this.queue.filter((id) => id !== runId);
      this.setRunStatus(runId, "paused");
      this.emitRunStatus(runId, "paused");
      this.emitEvent(runId, "notice", {
        runId,
        scope: "run",
        code: "RUN_PAUSED",
        message: "Run paused before start.",
      });
      return;
    }
    this.ensureControl(runId).pauseRequested = true;
  }

  resume(runId: string): void {
    const run = this.getRun(runId);
    if (run.status !== "paused") {
      throw new InvalidStateError(
        `cannot resume a run in status ${run.status}`,
      );
    }
    const ctrl = this.ensureControl(runId);
    ctrl.pauseRequested = false;
    ctrl.pauseAnnounced = false;
    // Keep the controller unless it was used: in-flight calls hold its signal,
    // and a later cancel must still be able to abort them.
    if (ctrl.abortController.signal.aborted) {
      ctrl.abortController = new AbortController();
    }
    // Resumed before the executor finished winding down to its checkpoint:
    // workers that already stopped need one more pass.
    if (this.activeRunId === runId) ctrl.rerunRequested = true;

    if (this.activeRunId && this.activeRunId !== runId) {
      this.setRunStatus(runId, "queued");
      this.emitRunStatus(runId, "queued");
      this.enqueue(runId);
      return;
    }
    this.setRunStatus(runId, "running");
    this.emitRunStatus(runId, "running");
    this.emitEvent(runId, "notice", {
      runId,
      scope: "run",
      code: "RUN_RESUMED",
      message: "Run resumed.",
    });
    this.enqueue(runId);
  }

  cancel(runId: string): void {
    const run = this.getRun(runId);
    if (
      run.status !== "queued" &&
      run.status !== "running" &&
      run.status !== "paused"
    ) {
      throw new InvalidStateError(
        `cannot cancel a run in status ${run.status}`,
      );
    }
    const ctrl = this.ensureControl(runId);
    ctrl.cancelRequested = true;
    ctrl.abortController.abort();
    this.queue = this.queue.filter((id) => id !== runId);

    if (run.status === "queued" || run.status === "paused") {
      this.finishTerminal(runId, "cancelled");
      return;
    }
    // running: executor will observe cancelRequested
  }

  retryTask(runId: string, taskResultId: string): void {
    const run = this.getRun(runId);
    if (run.status === "cancelled" || run.status === "queued") {
      throw new InvalidStateError(
        `cannot retry a task when run is ${run.status}`,
      );
    }
    const tr = prepare(
      `SELECT id, status FROM task_results WHERE id = ? AND run_id = ?`,
    ).get(taskResultId, runId) as { id: string; status: string } | undefined;
    if (!tr) throw new InvalidStateError("task not found");
    if (tr.status !== "error") {
      throw new InvalidStateError(
        `cannot retry a task in status ${tr.status}`,
      );
    }

    const db = getDb();
    db.transaction(() => {
      prepare(`DELETE FROM validator_results WHERE task_result_id = ?`).run(
        taskResultId,
      );
      prepare(`DELETE FROM judgment_attempts WHERE task_result_id = ?`).run(
        taskResultId,
      );
      prepare(`DELETE FROM task_scores WHERE task_result_id = ?`).run(
        taskResultId,
      );
      prepare(
        `UPDATE task_results SET status = 'pending', error = NULL,
         raw_output = NULL, output_hash = NULL, finish_reason = NULL,
         prompt_tokens = NULL, completion_tokens = NULL, cost_usd = NULL,
         latency_ms = NULL, finished_at = NULL, retry_count = retry_count + 1
         WHERE id = ?`,
      ).run(taskResultId);
      if (
        run.status === "completed" ||
        run.status === "incomplete"
      ) {
        prepare(
          `UPDATE runs SET status = 'running', finished_at = NULL WHERE id = ?`,
        ).run(runId);
        prepare(`DELETE FROM bundle_run_scores WHERE run_id = ?`).run(runId);
      }
    })();

    // The executor may already be past this task; ask it for another pass so
    // the retried row is not left pending when the run finalizes.
    if (this.activeRunId === runId) {
      this.ensureControl(runId).rerunRequested = true;
    }
    this.enqueue(runId);
  }

  private getRun(runId: string): {
    id: string;
    status: string;
    budget_usd: number | null;
    total_cost_usd: number;
    parameters_json: string;
    seed: number;
    started_at: number | null;
    created_at: number;
  } {
    const row = prepare(
      `SELECT id, status, budget_usd, total_cost_usd, parameters_json, seed,
              started_at, created_at
       FROM runs WHERE id = ?`,
    ).get(runId) as
      | {
          id: string;
          status: string;
          budget_usd: number | null;
          total_cost_usd: number;
          parameters_json: string;
          seed: number;
          started_at: number | null;
          created_at: number;
        }
      | undefined;
    if (!row) throw new InvalidStateError(`run not found: ${runId}`);
    return row;
  }

  private setRunStatus(runId: string, status: string): void {
    const updates: string[] = [`status = @status`];
    const params: Record<string, unknown> = { status, id: runId };
    if (status === "running") {
      const cur = this.getRun(runId);
      if (cur.started_at == null) {
        updates.push(`started_at = @started_at`);
        params.started_at = Date.now();
      }
    }
    if (
      status === "completed" ||
      status === "cancelled" ||
      status === "incomplete"
    ) {
      updates.push(`finished_at = @finished_at`);
      params.finished_at = Date.now();
    }
    prepare(`UPDATE runs SET ${updates.join(", ")} WHERE id = @id`).run(params);
  }

  private progress(runId: string): {
    scored: number;
    error: number;
    total: number;
  } {
    const row = prepare(
      `SELECT
         SUM(CASE WHEN status = 'scored' THEN 1 ELSE 0 END) AS scored,
         SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error,
         COUNT(*) AS total
       FROM task_results WHERE run_id = ?`,
    ).get(runId) as { scored: number; error: number; total: number };
    return {
      scored: row.scored ?? 0,
      error: row.error ?? 0,
      total: row.total ?? 0,
    };
  }

  private emitRunStatus(runId: string, status: string): void {
    const run = this.getRun(runId);
    const started = run.started_at ?? run.created_at;
    this.emitEvent(runId, "run.status", {
      runId,
      status,
      totalCostUsd: run.total_cost_usd,
      progress: this.progress(runId),
      elapsedMs: Date.now() - started,
    });
  }

  private async pump(): Promise<void> {
    if (this.workerBusy) return;
    if (this.activeRunId) return;
    const next = this.queue.shift();
    if (!next) return;
    this.workerBusy = true;
    this.activeRunId = next;
    try {
      await this.executeRun(next);
    } catch (err) {
      console.error("[run-engine] executeRun failed", err);
      try {
        this.finishTerminal(next, "incomplete");
      } catch {
        // ignore
      }
    } finally {
      this.activeRunId = null;
      this.workerBusy = false;
      void this.pump();
    }
  }

  private finishTerminal(
    runId: string,
    status: "completed" | "cancelled" | "incomplete",
  ): void {
    this.setRunStatus(runId, status);
    const finalized = finalizeRun(runId);
    this.emitRunStatus(runId, status);
    const run = this.getRun(runId);
    this.emitEvent(runId, "run.complete", {
      runId,
      status,
      bundleRunScore: status === "completed" ? finalized.bundleRunScore : null,
      totalCostUsd: run.total_cost_usd,
    });
    // Drop in-memory key once the run is terminal.
    this.runKeys.delete(runId);
  }

  /**
   * Write the paused status and notice once per pause. Workers call this when
   * they reach a checkpoint with a pause pending, then stop; the executor
   * returns and frees the worker slot instead of waiting for a resume.
   */
  private announcePause(runId: string): void {
    const ctrl = this.ensureControl(runId);
    if (ctrl.pauseAnnounced) return;
    ctrl.pauseAnnounced = true;
    this.setRunStatus(runId, "paused");
    this.emitRunStatus(runId, "paused");
    this.emitEvent(runId, "notice", {
      runId,
      scope: "run",
      code: "RUN_PAUSED",
      message: "Run paused at checkpoint.",
    });
  }

  private budgetWouldExceed(
    runId: string,
    nextEstimate: number,
  ): boolean {
    const run = this.getRun(runId);
    if (run.budget_usd == null) return false;
    return run.total_cost_usd + nextEstimate >= run.budget_usd;
  }

  private async executeRun(runId: string): Promise<void> {
    const ctrl = this.ensureControl(runId);
    ctrl.cancelRequested = false;
    if (ctrl.abortController.signal.aborted) {
      ctrl.abortController = new AbortController();
    }

    let run = this.getRun(runId);
    if (run.status === "paused") return;
    if (run.status === "cancelled") return;

    // After a server restart the in-memory key map is empty and production has
    // no env fallback. Park the run so the launcher can press Resume, which
    // sends the key again — finishing it here would strand the remaining tasks.
    if (!this.resolveRunKey(runId)) {
      ctrl.pauseAnnounced = true;
      this.setRunStatus(runId, "paused");
      this.emitRunStatus(runId, "paused");
      this.emitEvent(runId, "notice", {
        runId,
        scope: "run",
        code: "NEEDS_KEY",
        message:
          "Paused: the API key for this run is no longer on the server (restart or missing key). Press Resume to continue with your OpenRouter key.",
      });
      return;
    }

    if (run.status === "queued" || run.status === "running") {
      this.setRunStatus(runId, "running");
      this.emitRunStatus(runId, "running");
    }

    run = this.getRun(runId);
    const params = JSON.parse(run.parameters_json) as {
      categories: Category[];
      trials_per_pair: number;
      candidate_concurrency: number;
      tasks: Array<
        TaskSnapshot & {
          id: string;
          category: Category;
          wrapper: string;
          task_body: string;
          judge_prompt: string;
          validator_profile?: "official" | "custom_answer_v1";
          must_mention?: string[];
        }
      >;
      pricing_snapshot?: Record<string, unknown>;
    };

    // Salvage prior voided panels before scheduling new work
    this.rescueSalvageableJudgingFailures(runId);

    const categories = CATEGORY_ORDER.filter((c) =>
      params.categories.includes(c),
    );
    const candidates = prepare(
      `SELECT model_id FROM run_candidates WHERE run_id = ?`,
    ).all(runId) as Array<{ model_id: string }>;

    const concurrency = Math.min(4, params.candidate_concurrency || 1);
    let budgetStopped = false;

    const selectedTasks = (params.tasks ?? []).filter((t) =>
      categories.includes(t.category),
    );

    const runCandidate = async (candidateModelId: string) => {
      for (const taskMeta of selectedTasks) {
        const category = taskMeta.category;
        for (let trial = 0; trial < (params.trials_per_pair || 1); trial++) {
          if (ctrl.cancelRequested) return;

          const tr = prepare(
            `SELECT id, status FROM task_results
             WHERE run_id = ? AND task_id = ? AND candidate_model_id = ?
               AND trial_index = ?`,
          ).get(runId, taskMeta.id, candidateModelId, trial) as
            | { id: string; status: string }
            | undefined;
          if (!tr) continue;
          if (tr.status === "scored" || tr.status === "error") continue;

          // Checkpoint: stop here when a pause is pending. Only reached with
          // real work left, so a pause never parks a run that is already done.
          if (ctrl.pauseRequested) {
            this.announcePause(runId);
            return;
          }

          // Budget gate before dispatch
          const panelJudges = this.activePanel(runId, category).map(
            (p) => p.judge_model_id,
          );
          const est = estimateTaskCost(
            {
              wrapper: taskMeta.wrapper,
              task_body: taskMeta.task_body,
              judge_prompt: taskMeta.judge_prompt,
              token_limit: taskMeta.token_limit,
            },
            candidateModelId,
            panelJudges,
          );
          if (this.budgetWouldExceed(runId, est.max)) {
            budgetStopped = true;
            this.emitEvent(runId, "notice", {
              runId,
              scope: "run",
              code: "BUDGET_CAP_REACHED",
              message: `Hard budget cap $${this.getRun(runId).budget_usd} reached; run marked incomplete.`,
            });
            return;
          }

          try {
            await this.runTask(runId, tr.id, taskMeta, candidateModelId);
          } catch (err) {
            // One broken task must not take the run (and the other workers)
            // down with it. Record it and move on; it can be retried.
            console.error("[run-engine] task failed unexpectedly", tr.id, err);
            this.failTaskInternal(runId, tr.id, err);
          }
        }
      }
    };

    const runAllCandidates = async () => {
      if (concurrency <= 1) {
        for (const c of candidates) {
          if (ctrl.cancelRequested || budgetStopped || ctrl.pauseRequested) {
            break;
          }
          await runCandidate(c.model_id);
        }
        return;
      }
      const pool = [...candidates];
      const workers: Promise<void>[] = [];
      for (let i = 0; i < concurrency; i++) {
        workers.push(
          (async () => {
            while (pool.length > 0) {
              if (ctrl.cancelRequested || budgetStopped || ctrl.pauseRequested) {
                return;
              }
              const next = pool.shift();
              if (!next) return;
              await runCandidate(next.model_id);
            }
          })(),
        );
      }
      await Promise.all(workers);
    };

    // A retry or an early resume can add work behind the workers' backs, so
    // keep making passes until nothing asked for another one.
    for (;;) {
      ctrl.rerunRequested = false;
      await runAllCandidates();
      if (ctrl.cancelRequested || budgetStopped || ctrl.pauseRequested) break;
      if (!ctrl.rerunRequested) break;
    }

    if (ctrl.cancelRequested) {
      // cancel() already finalized a run that was showing as paused.
      if (this.getRun(runId).status !== "cancelled") {
        this.finishTerminal(runId, "cancelled");
      }
      return;
    }

    const prog = this.progress(runId);
    const open = prog.total - prog.scored - prog.error;

    if (ctrl.pauseRequested && !budgetStopped) {
      if (open > 0) {
        // Parked. Returning frees the worker slot for other runs; resume()
        // puts this run back in the queue.
        this.announcePause(runId);
        return;
      }
      // Everything finished before any worker reached a checkpoint.
      ctrl.pauseRequested = false;
    }

    if (prog.scored === prog.total && prog.total > 0) {
      this.finishTerminal(runId, "completed");
    } else {
      this.finishTerminal(runId, "incomplete");
    }
  }

  /** Mark a task as an excluded failure after an unexpected engine error. */
  private failTaskInternal(
    runId: string,
    taskResultId: string,
    err: unknown,
  ): void {
    const message = `internal error: ${err instanceof Error ? err.message : "unexpected failure"}`;
    try {
      prepare(
        `UPDATE task_results SET status = 'error', error = ?, finished_at = ?
         WHERE id = ? AND status NOT IN ('scored', 'error')`,
      ).run(
        JSON.stringify({ kind: "judging_failure", message }),
        Date.now(),
        taskResultId,
      );
      this.emitTaskStatus(runId, taskResultId, "error", {
        kind: "judging_failure",
        message,
      });
      this.emitEvent(runId, "notice", {
        runId,
        scope: "task",
        code: "JUDGING_EXCLUDED",
        message:
          "Task excluded from scoring (internal error) — does not penalize the model. Retry to run it again.",
        taskResultId,
        details: { kind: "judging_failure", reason: "internal_error" },
      });
    } catch (inner) {
      console.error("[run-engine] failTaskInternal failed", taskResultId, inner);
    }
  }

  private activePanel(
    runId: string,
    category: Category,
  ): Array<{ judge_model_id: string; panel_position: number }> {
    return prepare(
      `SELECT judge_model_id, panel_position FROM category_judge_panels
       WHERE run_id = ? AND category = ? AND panel_position IS NOT NULL
       ORDER BY panel_position ASC`,
    ).all(runId, category) as Array<{
      judge_model_id: string;
      panel_position: number;
    }>;
  }

  private reserves(
    runId: string,
    category: Category,
  ): Array<{ judge_model_id: string; reserve_order: number }> {
    return prepare(
      `SELECT judge_model_id, reserve_order FROM category_judge_panels
       WHERE run_id = ? AND category = ? AND reserve_order IS NOT NULL
       ORDER BY reserve_order ASC`,
    ).all(runId, category) as Array<{
      judge_model_id: string;
      reserve_order: number;
    }>;
  }

  private async runTask(
    runId: string,
    taskResultId: string,
    taskMeta: TaskSnapshot & {
      id: string;
      category: Category;
      wrapper: string;
      task_body: string;
      judge_prompt: string;
      validator_profile?: "official" | "custom_answer_v1";
      must_mention?: string[];
    },
    candidateModelId: string,
  ): Promise<void> {
    const ctrl = this.ensureControl(runId);
    const statusOf = (): string =>
      (
        prepare(`SELECT status FROM task_results WHERE id = ?`).get(
          taskResultId,
        ) as { status: string }
      ).status;
    /** True when the task should stop at this checkpoint (cancel or pause). */
    const shouldStop = (): boolean => {
      if (ctrl.cancelRequested) return true;
      if (ctrl.pauseRequested) {
        this.announcePause(runId);
        return true;
      }
      return false;
    };

    let status = statusOf();

    // Resume helpers
    if (status === "validating") {
      prepare(`DELETE FROM validator_results WHERE task_result_id = ?`).run(
        taskResultId,
      );
    }
    if (status === "pending" || status === "streaming") {
      await this.phaseCandidate(
        runId,
        taskResultId,
        taskMeta,
        candidateModelId,
      );
      status = statusOf();
      if (status === "error") return;
    }

    // The row keeps its phase status, so a paused task picks up where it left
    // off on the next pass.
    if (shouldStop()) return;

    if (status === "validating") {
      await this.phaseValidate(runId, taskResultId, taskMeta);
      status = statusOf();
      if (status === "error") return;
      if (shouldStop()) return;
    }
    if (status === "judging") {
      await this.phaseJudge(runId, taskResultId, taskMeta, candidateModelId);
    }
  }

  private emitTaskStatus(
    runId: string,
    taskResultId: string,
    status: string,
    error?: { kind: string; message: string },
  ): void {
    const tr = prepare(
      `SELECT tr.*, t.category FROM task_results tr
       JOIN tasks t ON t.id = tr.task_id WHERE tr.id = ?`,
    ).get(taskResultId) as {
      task_id: string;
      category: Category;
      candidate_model_id: string;
      trial_index: number;
    };
    this.emitEvent(runId, "task.status", {
      runId,
      taskResultId,
      taskId: tr.task_id,
      category: tr.category,
      candidateModelId: tr.candidate_model_id,
      trialIndex: tr.trial_index,
      status,
      ...(error ? { error } : {}),
    });
  }

  private addCost(runId: string, cost: number): void {
    prepare(
      `UPDATE runs SET total_cost_usd = total_cost_usd + ? WHERE id = ?`,
    ).run(cost, runId);
    const run = this.getRun(runId);
    this.emitEvent(runId, "run.cost", {
      runId,
      totalCostUsd: run.total_cost_usd,
      budgetUsd: run.budget_usd,
    });
  }

  private async phaseCandidate(
    runId: string,
    taskResultId: string,
    taskMeta: {
      wrapper: string;
      task_body: string;
      token_limit: number;
      category: Category;
      id: string;
      validator_profile?: "official" | "custom_answer_v1";
      must_mention?: string[];
    },
    candidateModelId: string,
  ): Promise<void> {
    const ctrl = this.ensureControl(runId);
    const existing = prepare(`SELECT * FROM task_results WHERE id = ?`).get(
      taskResultId,
    ) as {
      raw_output: string | null;
      prompt_tokens: number | null;
      status: string;
    };

    if (existing.raw_output && existing.prompt_tokens != null) {
      prepare(
        `UPDATE task_results SET status = 'validating' WHERE id = ?`,
      ).run(taskResultId);
      return;
    }

    prepare(
      `UPDATE task_results SET status = 'streaming', started_at = COALESCE(started_at, ?) WHERE id = ?`,
    ).run(Date.now(), taskResultId);
    this.emitTaskStatus(runId, taskResultId, "streaming");

    const messages = [
      { role: "system" as const, content: taskMeta.wrapper },
      { role: "user" as const, content: taskMeta.task_body },
    ];

    // Coalesce deltas ~15/sec
    let lastEmit = 0;
    let pendingDelta = "";
    let tokenEst = 0;
    const flushDelta = (force = false) => {
      if (!pendingDelta) return;
      const now = Date.now();
      if (!force && now - lastEmit < 66) return;
      this.emitEvent(runId, "candidate.delta", {
        runId,
        taskResultId,
        delta: pendingDelta,
        tokens: tokenEst,
      });
      pendingDelta = "";
      lastEmit = now;
    };

    try {
      const callCandidate = (opts: {
        excludeReasoning?: boolean;
        disableReasoning?: boolean;
      }) =>
        streamChat({
          model: candidateModelId,
          messages,
          temperature: 0.7,
          maxTokens: taskMeta.token_limit,
          excludeReasoning: opts.excludeReasoning,
          disableReasoning: opts.disableReasoning,
          responseFormat:
            taskMeta.validator_profile === "custom_answer_v1"
              ? {
                  name: "custom_answer",
                  schema: {
                    type: "object",
                    properties: { answer: { type: "string" } },
                    required: ["answer"],
                    additionalProperties: false,
                  },
                }
              : undefined,
          signal: ctrl.abortController.signal,
          deadlineMs: getCallDeadlineMs(),
          maxRetries: getMaxRetries(),
          apiKey: this.resolveRunKey(runId),
          onDelta: (d) => {
            pendingDelta += d;
            tokenEst = Math.ceil((tokenEst * 4 + d.length) / 4);
            flushDelta();
          },
          onRetry: (attempt, delayMs, reason) => {
            this.emitEvent(runId, "notice", {
              runId,
              scope: "task",
              code: "RETRY_SCHEDULED",
              message: `Retry ${attempt} scheduled (${reason})`,
              taskResultId,
              details: { attempt, delayMs, reason },
            });
          },
        });

      let result = await callCandidate({ excludeReasoning: true });
      const emptyBilled = (r: typeof result) =>
        !r.text.trim() &&
        (r.usage.completion_tokens > 50 ||
          (r.usage.reasoning_tokens ?? 0) > 0);
      if (emptyBilled(result) && !ctrl.cancelRequested) {
        this.emitEvent(runId, "notice", {
          runId,
          scope: "task",
          code: "RETRY_SCHEDULED",
          message:
            "Empty answer after billed tokens — retrying with thinking turned off.",
          taskResultId,
          details: { reason: "empty_reasoning" },
        });
        result = await callCandidate({ disableReasoning: true });
      }
      if (emptyBilled(result)) {
        throw new OpenRouterError(
          "upstream",
          "Model billed tokens but returned no visible answer (reasoning likely ate the budget).",
        );
      }
      flushDelta(true);

      const output_hash = createHash("sha256")
        .update(result.text)
        .digest("hex");

      getDb().transaction(() => {
        prepare(
          `UPDATE task_results SET
             raw_output = @raw_output,
             output_hash = @output_hash,
             request_hash = @request_hash,
             provider = @provider,
             finish_reason = @finish_reason,
             prompt_tokens = @prompt_tokens,
             completion_tokens = @completion_tokens,
             cost_usd = @cost_usd,
             latency_ms = @latency_ms,
             status = 'validating'
           WHERE id = @id`,
        ).run({
          id: taskResultId,
          raw_output: result.text,
          output_hash,
          request_hash: result.request_hash,
          provider: result.provider,
          finish_reason: result.finish_reason,
          prompt_tokens: result.usage.prompt_tokens,
          completion_tokens: result.usage.completion_tokens,
          cost_usd: result.usage.cost_usd,
          latency_ms: result.latency_ms,
        });
        prepare(
          `UPDATE runs SET total_cost_usd = total_cost_usd + ? WHERE id = ?`,
        ).run(result.usage.cost_usd, runId);
      })();

      this.emitEvent(runId, "candidate.complete", {
        runId,
        taskResultId,
        finishReason: result.finish_reason,
        tokens: {
          prompt: result.usage.prompt_tokens,
          completion: result.usage.completion_tokens,
        },
        costUsd: result.usage.cost_usd,
        latencyMs: result.latency_ms,
      });
      const run = this.getRun(runId);
      this.emitEvent(runId, "run.cost", {
        runId,
        totalCostUsd: run.total_cost_usd,
        budgetUsd: run.budget_usd,
      });
    } catch (err) {
      if (ctrl.cancelRequested || (err instanceof OpenRouterError && err.kind === "aborted")) {
        // leave at prior checkpoint (pending) — streaming status without payload
        prepare(
          `UPDATE task_results SET status = 'pending' WHERE id = ? AND status = 'streaming'`,
        ).run(taskResultId);
        return;
      }
      const message =
        err instanceof Error ? err.message : "candidate stream failed";
      const attempts =
        err instanceof OpenRouterError ? err.attempts : 1;
      prepare(
        `UPDATE task_results SET status = 'error', error = ?, finished_at = ?
         WHERE id = ?`,
      ).run(
        JSON.stringify({
          kind: "infra_failure",
          message,
          attempts,
        }),
        Date.now(),
        taskResultId,
      );
      this.emitTaskStatus(runId, taskResultId, "error", {
        kind: "infra_failure",
        message,
      });
      this.emitEvent(runId, "notice", {
        runId,
        scope: "task",
        code: "INFRA_PENALTY",
        message:
          "Task scored 0 (model failed to answer) — retry to replace the penalty.",
        taskResultId,
        details: { kind: "infra_failure", attempts },
      });
    }
  }

  private async phaseValidate(
    runId: string,
    taskResultId: string,
    taskMeta: TaskSnapshot & { category: Category },
  ): Promise<void> {
    const row = prepare(
      `SELECT raw_output FROM task_results WHERE id = ?`,
    ).get(taskResultId) as { raw_output: string | null };

    prepare(`DELETE FROM validator_results WHERE task_result_id = ?`).run(
      taskResultId,
    );
    const findings = runValidators(
      taskMeta.category,
      stripThinkTags(row.raw_output ?? ""),
      taskMeta,
    );

    getDb().transaction(() => {
      const ins = prepare(
        `INSERT INTO validator_results (
          id, task_result_id, validator, passed, expected_json, actual_json, details
        ) VALUES (
          @id, @task_result_id, @validator, @passed, @expected_json, @actual_json, @details
        )`,
      );
      for (const f of findings) {
        ins.run({
          id: randomUUID(),
          task_result_id: taskResultId,
          validator: f.validator,
          passed: f.passed ? 1 : 0,
          expected_json: f.expected_json,
          actual_json: f.actual_json,
          details: f.details,
        });
      }
      prepare(
        `UPDATE task_results SET status = 'judging' WHERE id = ?`,
      ).run(taskResultId);
    })();

    const countable = findings.filter((f) => isCountableFinding(f));
    this.emitEvent(runId, "validation.complete", {
      runId,
      taskResultId,
      checks: findings.map((f) => ({
        validator: f.validator,
        passed: f.passed,
        expected: f.expected_json ?? undefined,
        actual: f.actual_json ?? undefined,
        details: f.details,
        skipped: f.skipped === true || f.details.startsWith("skipped:"),
        informational:
          f.informational === true || f.details.startsWith("note:"),
      })),
      allPassed:
        countable.length === 0 ? true : countable.every((f) => f.passed),
    });
  }

  private resolvePanelForCandidate(
    runId: string,
    category: Category,
    candidateModelId: string,
  ): Array<{
    judge_model_id: string;
    is_substitute: boolean;
    substituted_for: string | null;
  }> {
    const panel = this.activePanel(runId, category);
    const reserves = this.reserves(runId, category);
    const used = new Set(panel.map((p) => p.judge_model_id));
    let reserveIdx = 0;

    const nextReserve = (): string | null => {
      while (reserveIdx < reserves.length) {
        const r = reserves[reserveIdx++]!;
        if (r.judge_model_id === candidateModelId) continue;
        if (used.has(r.judge_model_id)) continue;
        used.add(r.judge_model_id);
        return r.judge_model_id;
      }
      return null;
    };

    return panel.map((p) => {
      if (p.judge_model_id !== candidateModelId) {
        return {
          judge_model_id: p.judge_model_id,
          is_substitute: false,
          substituted_for: null,
        };
      }
      const sub = nextReserve();
      if (!sub) {
        return {
          judge_model_id: p.judge_model_id,
          is_substitute: false,
          substituted_for: null,
        };
      }
      this.emitEvent(runId, "notice", {
        runId,
        scope: "task",
        code: "JUDGE_REPLACED",
        message: `Self-judging: replaced ${p.judge_model_id} with ${sub}`,
        details: {
          original: p.judge_model_id,
          replacement: sub,
          reason: "self_judging",
        },
      });
      return {
        judge_model_id: sub,
        is_substitute: true,
        substituted_for: p.judge_model_id,
      };
    });
  }

  private async phaseJudge(
    runId: string,
    taskResultId: string,
    taskMeta: {
      category: Category;
      wrapper: string;
      task_body: string;
      judge_prompt: string;
      id: string;
      validator_profile?: "official" | "custom_answer_v1";
      must_mention?: string[];
    },
    candidateModelId: string,
  ): Promise<void> {
    const ctrl = this.ensureControl(runId);
    const row = prepare(
      `SELECT raw_output, candidate_model_id, finish_reason, completion_tokens
       FROM task_results WHERE id = ?`,
    ).get(taskResultId) as {
      raw_output: string;
      candidate_model_id: string;
      finish_reason: string | null;
      completion_tokens: number | null;
    };

    if (!(row.raw_output ?? "").trim()) {
      prepare(
        `UPDATE task_results SET status = 'error', error = ?, finished_at = ?
         WHERE id = ?`,
      ).run(
        JSON.stringify({
          kind: "infra_failure",
          message:
            "No visible candidate answer (empty output after the model call).",
        }),
        Date.now(),
        taskResultId,
      );
      this.emitTaskStatus(runId, taskResultId, "error", {
        kind: "infra_failure",
        message: "No visible candidate answer.",
      });
      this.emitEvent(runId, "notice", {
        runId,
        scope: "task",
        code: "INFRA_PENALTY",
        message:
          "Task scored 0 (model emitted no visible answer) — retry to replace the penalty.",
        taskResultId,
        details: { kind: "infra_failure", reason: "empty_output" },
      });
      return;
    }

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
    const findingObjs = findings.map((f) => ({
      validator: f.validator,
      passed: f.passed === 1,
      expected_json: f.expected_json,
      actual_json: f.actual_json,
      details: f.details,
    }));
    const validatorBlock = renderValidatorBlock(findingObjs);

    // Skip slots that already have a final judgment. A slot also counts as
    // done when a reserve answered in its place, so a resume after a crash
    // does not ask the replaced judge again and end up with four verdicts.
    const existingFinals = prepare(
      `SELECT judge_model_id, substituted_for FROM judgment_attempts
       WHERE task_result_id = ? AND is_final = 1`,
    ).all(taskResultId) as Array<{
      judge_model_id: string;
      substituted_for: string | null;
    }>;
    const doneJudges = new Set<string>();
    for (const j of existingFinals) {
      doneJudges.add(j.judge_model_id);
      if (j.substituted_for) doneJudges.add(j.substituted_for);
    }

    let slots = this.resolvePanelForCandidate(
      runId,
      taskMeta.category,
      candidateModelId,
    );

    // If a self-judge couldn't be replaced
    if (
      slots.some(
        (s) =>
          s.judge_model_id === candidateModelId && !s.is_substitute,
      )
    ) {
      prepare(
        `UPDATE task_results SET status = 'error', error = ?, finished_at = ?
         WHERE id = ?`,
      ).run(
        JSON.stringify({
          kind: "judging_failure",
          message: "no reserve available for self-judging substitution",
        }),
        Date.now(),
        taskResultId,
      );
      this.emitTaskStatus(runId, taskResultId, "error", {
        kind: "judging_failure",
        message: "no reserve available for self-judging substitution",
      });
      this.emitEvent(runId, "notice", {
        runId,
        scope: "task",
        code: "JUDGING_EXCLUDED",
        message:
          "Task excluded from scoring (judge panel failed) — does not penalize the model.",
        taskResultId,
        details: { kind: "judging_failure", reason: "self_judge_no_reserve" },
      });
      return;
    }

    const slotJudgeIds = slots.map((s) => s.judge_model_id);
    slots = slots.filter((s) => !doneJudges.has(s.judge_model_id));

    const candidateIds = (
      prepare(`SELECT model_id FROM run_candidates WHERE run_id = ?`).all(
        runId,
      ) as Array<{ model_id: string }>
    ).map((c) => c.model_id);

    // Pack text is screened at preflight; this is the last line of defence.
    const packLeak = findModelMention(
      [
        taskMeta.judge_prompt,
        taskMeta.wrapper,
        taskMeta.task_body,
        ...(taskMeta.must_mention ?? []),
      ].join("\n"),
      candidateIds,
    );
    if (packLeak) {
      const message = `blindness check failed: pack text names candidate model "${packLeak}"`;
      prepare(
        `UPDATE task_results SET status = 'error', error = ?, finished_at = ?
         WHERE id = ?`,
      ).run(
        JSON.stringify({ kind: "judging_failure", message }),
        Date.now(),
        taskResultId,
      );
      this.emitTaskStatus(runId, taskResultId, "error", {
        kind: "judging_failure",
        message,
      });
      this.emitEvent(runId, "notice", {
        runId,
        scope: "task",
        code: "JUDGING_EXCLUDED",
        message:
          "Task excluded from scoring (pack text names a candidate model) — does not penalize the model.",
        taskResultId,
        details: { kind: "judging_failure", reason: "blind_conflict" },
      });
      return;
    }

    // An answer that names a model must still be judged, so names are masked
    // instead of failing the task.
    const answer = maskModelMentions(
      stripThinkTags(row.raw_output ?? ""),
      candidateIds,
    );
    if (answer.masked > 0) {
      this.emitEvent(runId, "notice", {
        runId,
        scope: "task",
        code: "MODEL_NAMES_MASKED",
        message: `Masked ${answer.masked} model name mention(s) in the answer before judging.`,
        taskResultId,
        details: { masked: answer.masked },
      });
    }

    type AttemptOutcome = {
      ok: boolean;
      parsed: JudgeOutput | null;
      result: StreamChatResult | null;
      parse_status: "first_try" | "repaired" | "invalid";
      evidence: string | null;
      /** The call itself failed (network, rate limit, timeout) — not a formatting problem. */
      infra: boolean;
      /** The run was cancelled or the call was aborted mid-flight. */
      aborted: boolean;
    };

    const runAttempt = async (
      jid: string,
      attempt: number,
      repairErrors?: string,
    ): Promise<AttemptOutcome> => {
      const userParts = [
        `ORIGINAL TASK:\n${taskMeta.wrapper}\n\n${taskMeta.task_body}`,
        validatorBlock,
        `CANDIDATE ANSWER:\n${answer.text}`,
      ];
      if (answer.masked > 0) {
        userParts.push(MODEL_NAMES_MASKED_NOTE);
      }
      if (row.finish_reason === "length") {
        userParts.push(PLATFORM_TRUNCATION_NOTE);
      }
      if (taskMeta.must_mention && taskMeta.must_mention.length > 0) {
        userParts.push(
          `MUST MENTION / EXPECTED NOTES (judge-only; the candidate did not see this):\n${taskMeta.must_mention.map((m) => `- ${m}`).join("\n")}`,
        );
      }
      if (repairErrors) {
        userParts.push(
          `Your previous reply was not valid JSON matching the schema. Errors: ${repairErrors}. Reply with ONLY the JSON object.`,
        );
      }
      const messages = [
        {
          role: "system" as const,
          // Runtime wrap so already-seeded DB prompts also enforce English.
          content: withJudgeEnglishOnly(taskMeta.judge_prompt),
        },
        { role: "user" as const, content: userParts.join("\n\n") },
      ];

      this.emitEvent(runId, "judge.started", {
        runId,
        taskResultId,
        judgeModelId: jid,
        attempt,
      });

      let pending = "";
      let last = 0;
      const flush = (force = false) => {
        if (!pending) return;
        const now = Date.now();
        if (!force && now - last < 66) return;
        this.emitEvent(runId, "judge.delta", {
          runId,
          taskResultId,
          judgeModelId: jid,
          delta: pending,
        });
        pending = "";
        last = now;
      };

      try {
        const result = await streamChat({
          model: jid,
          messages,
          temperature: 0,
          maxTokens: JUDGE_MAX_TOKENS,
          excludeReasoning: true,
          responseFormat: {
            name: "judge_output",
            schema: judgeOutputJsonSchema,
          },
          signal: ctrl.abortController.signal,
          allowRetryAfterPartial: true,
          deadlineMs: getCallDeadlineMs(),
          maxRetries: getMaxRetries(),
          apiKey: this.resolveRunKey(runId),
          onDelta: (d) => {
            pending += d;
            flush();
          },
          onRetry: (a, delayMs, reason) => {
            this.emitEvent(runId, "notice", {
              runId,
              scope: "task",
              code: "RETRY_SCHEDULED",
              message: `Judge retry ${a} (${reason})`,
              taskResultId,
              details: { attempt: a, delayMs, reason },
            });
          },
        });
        flush(true);

        const parsed = parseJudgeOutput(result.text, {
          repaired: Boolean(repairErrors),
        });
        return {
          ok: parsed.ok,
          parsed: parsed.parsed,
          result,
          parse_status: parsed.parse_status,
          evidence: parsed.evidence,
          infra: false,
          aborted: false,
        };
      } catch (err) {
        const kind = err instanceof OpenRouterError ? err.kind : "judge_call";
        return {
          ok: false,
          parsed: null,
          result: null,
          parse_status: "invalid",
          evidence: `infra: ${kind}: ${err instanceof Error ? err.message : "judge call failed"}`,
          infra: true,
          aborted: kind === "aborted",
        };
      }
    };

    /** Insert one attempt row and bill it. Returns the row id. */
    const persistAttempt = (
      jid: string,
      attempt: number,
      parse_status: "first_try" | "repaired" | "invalid",
      is_final: boolean,
      parsed: JudgeOutput | null,
      result: StreamChatResult | null,
      evidence: string | null,
      substitute: boolean,
      substitutedFor: string | null,
    ): string => {
      const id = randomUUID();
      const server =
        parsed != null
          ? (parsed.scores.correctness +
              parsed.scores.requirement_compliance +
              parsed.scores.quality +
              parsed.scores.honesty) /
            4
          : null;
      prepare(
        `INSERT INTO judgment_attempts (
          id, task_result_id, judge_model_id, attempt, is_final, is_substitute,
          substituted_for, raw_output, parsed_json, evidence, parse_status,
          score_correctness, score_compliance, score_quality, score_honesty,
          claimed_overall, server_overall, verdict, prompt_tokens, completion_tokens,
          cost_usd, latency_ms, temperature, provider, created_at
        ) VALUES (
          @id, @task_result_id, @judge_model_id, @attempt, @is_final, @is_substitute,
          @substituted_for, @raw_output, @parsed_json, @evidence, @parse_status,
          @score_correctness, @score_compliance, @score_quality, @score_honesty,
          @claimed_overall, @server_overall, @verdict, @prompt_tokens, @completion_tokens,
          @cost_usd, @latency_ms, @temperature, @provider, @created_at
        )`,
      ).run({
        id,
        task_result_id: taskResultId,
        judge_model_id: jid,
        attempt,
        is_final: is_final ? 1 : 0,
        is_substitute: substitute ? 1 : 0,
        substituted_for: substitutedFor,
        raw_output: result?.text ?? null,
        parsed_json: parsed ? JSON.stringify(parsed) : null,
        evidence,
        parse_status,
        score_correctness: parsed?.scores.correctness ?? null,
        score_compliance: parsed?.scores.requirement_compliance ?? null,
        score_quality: parsed?.scores.quality ?? null,
        score_honesty: parsed?.scores.honesty ?? null,
        claimed_overall: parsed?.overall_score ?? null,
        server_overall: server,
        verdict: parsed?.verdict ?? null,
        prompt_tokens: result?.usage.prompt_tokens ?? null,
        completion_tokens: result?.usage.completion_tokens ?? null,
        cost_usd: result?.usage.cost_usd ?? null,
        latency_ms: result?.latency_ms ?? null,
        temperature: 0,
        provider: result?.provider ?? null,
        created_at: Date.now(),
      });
      if (result) this.addCost(runId, result.usage.cost_usd);
      return id;
    };

    // Reserves handed out during this phase, so two failing slots running in
    // parallel cannot pick the same replacement.
    const claimedReserves = new Set<string>();

    /**
     * One panel slot: the judge gets a plain try and a retry, then one reserve
     * judge gets the same two tries. Returns true when a valid verdict is stored.
     */
    const judgeOne = async (slot: {
      judge_model_id: string;
      is_substitute: boolean;
      substituted_for: string | null;
    }): Promise<boolean> => {
      const reserves = this.reserves(runId, taskMeta.category);
      let judgeId = slot.judge_model_id;
      let isSub = slot.is_substitute;
      let subFor = slot.substituted_for;

      let attemptNo = (
        prepare(
          `SELECT COALESCE(MAX(attempt), 0) AS m FROM judgment_attempts
           WHERE task_result_id = ? AND judge_model_id = ?`,
        ).get(taskResultId, judgeId) as { m: number }
      ).m;

      const pickReserve = (): string | null => {
        const usedIds = new Set(
          (
            prepare(
              `SELECT DISTINCT judge_model_id FROM judgment_attempts WHERE task_result_id = ?`,
            ).all(taskResultId) as Array<{ judge_model_id: string }>
          ).map((r) => r.judge_model_id),
        );
        const replacement = reserves.find(
          (r) =>
            r.judge_model_id !== candidateModelId &&
            r.judge_model_id !== judgeId &&
            !usedIds.has(r.judge_model_id) &&
            !slotJudgeIds.includes(r.judge_model_id) &&
            !claimedReserves.has(r.judge_model_id),
        );
        if (!replacement) return null;
        claimedReserves.add(replacement.judge_model_id);
        return replacement.judge_model_id;
      };

      for (let round = 0; round < 2; round++) {
        let repairErrors: string | undefined;
        let lastRowId: string | null = null;
        let lastOutcome: AttemptOutcome | null = null;

        for (let tryNo = 0; tryNo < 2; tryNo++) {
          attemptNo += 1;
          const outcome = await runAttempt(judgeId, attemptNo, repairErrors);
          // A cancelled run must not leave "invalid JSON" rows against a judge
          // that never got to answer.
          if (outcome.aborted || ctrl.cancelRequested) return false;

          if (outcome.ok && outcome.parsed) {
            const status = repairErrors ? "repaired" : outcome.parse_status;
            persistAttempt(
              judgeId,
              attemptNo,
              status,
              true,
              outcome.parsed,
              outcome.result,
              null,
              isSub,
              subFor,
            );
            this.emitJudgeComplete(
              runId,
              taskResultId,
              judgeId,
              attemptNo,
              status,
              isSub,
              subFor,
              outcome.parsed,
              outcome.result!,
            );
            return true;
          }

          lastRowId = persistAttempt(
            judgeId,
            attemptNo,
            "invalid",
            false,
            null,
            outcome.result,
            outcome.evidence,
            isSub,
            subFor,
          );
          lastOutcome = outcome;
          // A failed call is not a formatting mistake: retry it plainly instead
          // of telling the judge its JSON was wrong.
          repairErrors = outcome.infra
            ? undefined
            : (outcome.evidence ?? "schema");
        }

        const replacement = round === 0 ? pickReserve() : null;
        if (!replacement) {
          // Out of options: the last attempt stands as this slot's final answer.
          if (lastRowId) {
            prepare(
              `UPDATE judgment_attempts SET is_final = 1 WHERE id = ?`,
            ).run(lastRowId);
          }
          this.emitJudgeComplete(
            runId,
            taskResultId,
            judgeId,
            attemptNo,
            "invalid",
            isSub,
            subFor,
            null,
            lastOutcome?.result ?? null,
          );
          return false;
        }

        const original = judgeId;
        judgeId = replacement;
        isSub = true;
        subFor = original;
        this.emitEvent(runId, "notice", {
          runId,
          scope: "task",
          code: "JUDGE_REPLACED",
          message: `${lastOutcome?.infra ? "Judge call failed" : "Invalid JSON"}: replaced ${original} with ${judgeId}`,
          taskResultId,
          details: { original, replacement: judgeId },
        });
      }
      return false;
    };

    // Judge slots run through a small pool sized by the Settings value.
    const judgeLimit = Math.max(
      1,
      Math.min(3, Math.floor(getAppSettings().judgeConcurrency) || 3),
    );
    const slotQueue = [...slots];
    await Promise.all(
      Array.from({ length: Math.min(judgeLimit, slotQueue.length) }, async () => {
        for (let slot = slotQueue.shift(); slot; slot = slotQueue.shift()) {
          try {
            await judgeOne(slot);
          } catch (err) {
            console.error("[run-engine] judge slot failed", taskResultId, err);
          }
        }
      }),
    );
    if (ctrl.cancelRequested) return;

    const validCount = (
      prepare(
        `SELECT COUNT(*) AS n FROM judgment_attempts
         WHERE task_result_id = ? AND is_final = 1
           AND parse_status IN ('first_try','repaired')`,
      ).get(taskResultId) as { n: number }
    ).n;

    if (validCount < 1) {
      prepare(
        `UPDATE task_results SET status = 'error', error = ?, finished_at = ?
         WHERE id = ?`,
      ).run(
        JSON.stringify({
          kind: "judging_failure",
          message: "judge panel failed to produce any valid judgments",
        }),
        Date.now(),
        taskResultId,
      );
      this.emitTaskStatus(runId, taskResultId, "error", {
        kind: "judging_failure",
        message: "judge panel failed to produce any valid judgments",
      });
      this.emitEvent(runId, "notice", {
        runId,
        scope: "task",
        code: "JUDGING_EXCLUDED",
        message:
          "Task excluded from scoring (judge panel failed) — does not penalize the model.",
        taskResultId,
        details: { kind: "judging_failure", reason: "no_valid_judgments" },
      });
      return;
    }

    if (validCount < 3) {
      this.emitEvent(runId, "notice", {
        runId,
        scope: "task",
        code: "PARTIAL_JUDGE_PANEL",
        message: `Scoring with ${validCount}/3 valid judgments (reserve exhausted or judge JSON failed)`,
        taskResultId,
        details: { validCount, expected: 3 },
      });
    }

    // Score row and scored status commit together (lib/db.ts invariant), so a
    // crash cannot leave one without the other.
    const agg = getDb().transaction(() => {
      const result = aggregateTask(taskResultId);
      prepare(
        `UPDATE task_results SET status = 'scored', finished_at = ? WHERE id = ?`,
      ).run(Date.now(), taskResultId);
      return result;
    })();

    const tr = prepare(
      `SELECT tr.*, t.category FROM task_results tr
       JOIN tasks t ON t.id = tr.task_id WHERE tr.id = ?`,
    ).get(taskResultId) as {
      task_id: string;
      category: Category;
      candidate_model_id: string;
      trial_index: number;
    };

    this.emitEvent(runId, "task.scored", {
      runId,
      taskResultId,
      taskId: tr.task_id,
      category: tr.category,
      candidateModelId: tr.candidate_model_id,
      trialIndex: tr.trial_index,
      median: agg.median_overall,
      disagreement: agg.disagreement,
      flagged: agg.flagged,
      judgeOveralls: agg.judgeOveralls,
    });
  }

  private emitJudgeComplete(
    runId: string,
    taskResultId: string,
    judgeModelId: string,
    attempt: number,
    parseStatus: "first_try" | "repaired" | "invalid",
    substituted: boolean,
    substitutedFor: string | null,
    parsed: JudgeOutput | null,
    result: StreamChatResult | null,
  ): void {
    const server =
      parsed != null
        ? (parsed.scores.correctness +
            parsed.scores.requirement_compliance +
            parsed.scores.quality +
            parsed.scores.honesty) /
          4
        : undefined;
    this.emitEvent(runId, "judge.complete", {
      runId,
      taskResultId,
      judgeModelId,
      attempt,
      parseStatus,
      substituted,
      substitutedFor,
      ...(parsed
        ? {
            verdict: parsed.verdict,
            scores: parsed.scores,
            claimedOverall: parsed.overall_score,
            serverOverall: server,
            feedback: {
              whatWasGood: parsed.what_was_good,
              whatWasTerrible: parsed.what_was_terrible,
              whatWasMissing: parsed.what_was_missing,
              constraintViolations: parsed.constraint_violations,
              criticalErrors: parsed.critical_errors,
              specificEvidence: parsed.specific_evidence,
              oneBestImprovement: parsed.one_best_improvement,
            },
          }
        : {}),
      costUsd: result?.usage.cost_usd ?? 0,
      latencyMs: result?.latency_ms ?? 0,
    });
  }
}

export function getRunEngine(): RunEngine {
  const g = globalThis as typeof globalThis & GlobalEngine;
  if (!g.__aiJudgeEngine) {
    g.__aiJudgeEngine = new RunEngineImpl();
  }
  return g.__aiJudgeEngine;
}

/** Test helper — reset singleton. */
export function resetRunEngineForTests(): void {
  const g = globalThis as typeof globalThis & GlobalEngine;
  g.__aiJudgeEngine = undefined;
}
