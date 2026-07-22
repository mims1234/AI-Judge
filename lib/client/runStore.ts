import type {
  Category,
  RunSnapshot,
  SseEvent,
  TaskResultStatus,
  Verdict,
} from "@/lib/schemas";

/**
 * Canonical-state-plus-deltas store for the arena (plans/09 §3).
 * Snapshot rehydrates; SSE events apply idempotently on top.
 */

export type CellKey = `${string}:${Category}`;
export type StreamKey = string; // taskResultId or `${taskResultId}:${judgeModelId}`

export type ConnectionState = "live" | "reconnecting" | "disconnected" | "closed";

export type ValidatorCheck = {
  validator: string;
  passed: boolean;
  details: string;
  expected?: string;
  actual?: string;
  skipped?: boolean;
  informational?: boolean;
};

export type JudgeVerdict = {
  judgeModelId: string;
  parseStatus: "first_try" | "repaired" | "invalid";
  substituted: boolean;
  substitutedFor: string | null;
  attempt: number;
  verdict?: Verdict;
  scores?: {
    correctness: number;
    requirement_compliance: number;
    quality: number;
    honesty: number;
  };
  claimedOverall?: number;
  serverOverall?: number;
  feedback?: {
    whatWasGood: string[];
    whatWasTerrible: string[];
    whatWasMissing: string[];
    constraintViolations: string[];
    criticalErrors: string[];
    specificEvidence: string[];
    oneBestImprovement: string;
  };
  costUsd?: number;
  latencyMs?: number;
  started: boolean;
};

export type TrialState = {
  taskResultId: string;
  taskId: string;
  status: TaskResultStatus;
  requestHash?: string | null;
  answer: {
    text: string;
    tokens: number;
    promptTokens?: number;
    finishReason?: string;
    costUsd?: number;
    latencyMs?: number;
  };
  checks?: ValidatorCheck[];
  allPassed?: boolean;
  judges: Map<string, JudgeVerdict>;
  median?: number;
  spread?: number;
  flagged?: boolean;
  error?: { kind: "infra_failure" | "judging_failure"; message: string };
};

export type CellState = {
  candidateModelId: string;
  category: Category;
  trials: Map<number, TrialState>;
  medianAcrossTrials?: number;
};

export type RunMeta = {
  id: string;
  bundleId: string;
  bundleHash: string;
  status: RunSnapshot["run"]["status"];
  startedAt: string | null;
  finishedAt: string | null;
  spend: { actual: number; estimated: number | null; cap: number | null };
  progress: { scored: number; error: number; total: number; flagged: number };
  seed: number;
  parameters: Record<string, unknown>;
  bundleRunScore: number | null;
  notice?: { code: string; message: string } | null;
};

export type RunStoreState = {
  run: RunMeta;
  candidates: string[];
  judgePool: string[];
  cells: Map<CellKey, CellState>;
  /** taskResultId → cell location for fast event routing */
  byTaskResultId: Map<string, { cellKey: CellKey; trialIndex: number }>;
  connection: ConnectionState;
  lastEventId: number | null;
  reconnectInMs: number | null;
  showJudgeStreams: boolean;
};

export function cellKey(candidateModelId: string, category: Category): CellKey {
  return `${candidateModelId}:${category}`;
}

export function streamKeyCandidate(taskResultId: string): StreamKey {
  return taskResultId;
}

export function streamKeyJudge(taskResultId: string, judgeModelId: string): StreamKey {
  return `${taskResultId}:${judgeModelId}`;
}

function emptyTrial(
  taskResultId: string,
  taskId: string,
  status: TaskResultStatus = "pending",
): TrialState {
  return {
    taskResultId,
    taskId,
    status,
    answer: { text: "", tokens: 0 },
    judges: new Map(),
  };
}

export function hydrateFromSnapshot(snapshot: RunSnapshot): RunStoreState {
  const cells = new Map<CellKey, CellState>();
  const byTaskResultId = new Map<string, { cellKey: CellKey; trialIndex: number }>();
  let flagged = 0;
  let scored = 0;
  let error = 0;

  for (const tr of snapshot.task_results) {
    const key = cellKey(tr.candidate_model_id, tr.category);
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        candidateModelId: tr.candidate_model_id,
        category: tr.category,
        trials: new Map(),
      };
      cells.set(key, cell);
    }

    const trial: TrialState = {
      taskResultId: tr.id,
      taskId: tr.task_id,
      status: tr.status,
      requestHash: tr.request_hash,
      answer: {
        text: tr.raw_output ?? "",
        tokens: tr.tokens?.completion ?? 0,
        promptTokens: tr.tokens?.prompt,
        finishReason: tr.finish_reason ?? undefined,
        costUsd: tr.cost_usd ?? undefined,
        latencyMs: tr.latency_ms ?? undefined,
      },
      checks: tr.validator_results.map((v) => ({
        validator: v.validator,
        passed: v.passed,
        details: v.details,
        expected: v.expected,
        actual: v.actual,
        skipped: v.details?.startsWith("skipped:") ?? false,
        informational: v.details?.startsWith("note:") ?? false,
      })),
      allPassed: (() => {
        const countable = tr.validator_results.filter(
          (v) =>
            !(v.details?.startsWith("skipped:") ?? false) &&
            !(v.details?.startsWith("note:") ?? false),
        );
        return countable.length > 0
          ? countable.every((v) => v.passed)
          : undefined;
      })(),
      judges: new Map(
        tr.judgments.map((j) => [
          j.judge_model_id,
          {
            judgeModelId: j.judge_model_id,
            parseStatus: j.parse_status,
            substituted: j.is_substitute,
            substitutedFor: null,
            attempt: 1,
            started: true,
            verdict: j.verdict ?? undefined,
            scores: j.scores ?? undefined,
            claimedOverall: j.claimed_overall ?? undefined,
            serverOverall: j.computed_overall ?? undefined,
            feedback: {
              whatWasGood: j.what_was_good ?? [],
              whatWasTerrible: j.what_was_terrible ?? [],
              whatWasMissing: j.what_was_missing ?? [],
              constraintViolations: j.constraint_violations ?? [],
              criticalErrors: j.critical_errors ?? [],
              specificEvidence: j.specific_evidence ?? [],
              oneBestImprovement: j.one_best_improvement ?? "",
            },
            costUsd: undefined,
            latencyMs: undefined,
          } satisfies JudgeVerdict,
        ]),
      ),
      median: tr.aggregate?.median_overall,
      spread: tr.aggregate?.disagreement,
      flagged: tr.aggregate?.flagged,
      error: tr.error ?? undefined,
    };

    cell.trials.set(tr.trial_index, trial);
    byTaskResultId.set(tr.id, { cellKey: key, trialIndex: tr.trial_index });

    if (tr.status === "scored") scored += 1;
    if (tr.status === "error") error += 1;
    if (tr.aggregate?.flagged) flagged += 1;
  }

  // Cross-trial medians
  for (const cell of cells.values()) {
    const medians = [...cell.trials.values()]
      .map((t) => t.median)
      .filter((m): m is number => m != null);
    if (medians.length > 0) {
      const sorted = [...medians].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      cell.medianAcrossTrials =
        sorted.length % 2 === 0
          ? ((sorted[mid - 1]! + sorted[mid]!) / 2)
          : sorted[mid];
    }
  }

  const params = snapshot.run.parameters;
  const estimated =
    typeof params.cost_usd_expected === "number"
      ? params.cost_usd_expected
      : typeof params.estimated_cost_usd === "number"
        ? params.estimated_cost_usd
        : null;

  return {
    run: {
      id: snapshot.run.id,
      bundleId: snapshot.run.bundle_id,
      bundleHash: snapshot.run.bundle_hash,
      status: snapshot.run.status,
      startedAt: snapshot.run.started_at,
      finishedAt: snapshot.run.finished_at,
      spend: {
        actual: snapshot.run.total_cost_usd,
        estimated,
        cap: snapshot.run.budget_usd,
      },
      progress: {
        scored,
        error,
        total: snapshot.task_results.length,
        flagged,
      },
      seed: snapshot.run.seed,
      parameters: params,
      bundleRunScore: snapshot.bundle_run_score,
      notice: null,
    },
    candidates: snapshot.candidates,
    judgePool: snapshot.judge_pool,
    cells,
    byTaskResultId,
    connection: isTerminal(snapshot.run.status) ? "closed" : "live",
    lastEventId: snapshot.run.last_event_id,
    reconnectInMs: null,
    showJudgeStreams: false,
  };
}

export function isTerminal(status: RunSnapshot["run"]["status"]): boolean {
  return status === "completed" || status === "cancelled" || status === "incomplete";
}

function ensureTrial(
  state: RunStoreState,
  data: {
    taskResultId: string;
    taskId: string;
    category: Category;
    candidateModelId: string;
    trialIndex: number;
  },
): TrialState {
  const key = cellKey(data.candidateModelId, data.category);
  let cell = state.cells.get(key);
  if (!cell) {
    cell = {
      candidateModelId: data.candidateModelId,
      category: data.category,
      trials: new Map(),
    };
    state.cells.set(key, cell);
  }
  let trial = cell.trials.get(data.trialIndex);
  if (!trial) {
    trial = emptyTrial(data.taskResultId, data.taskId);
    cell.trials.set(data.trialIndex, trial);
  } else {
    trial.taskResultId = data.taskResultId;
    trial.taskId = data.taskId;
  }
  state.byTaskResultId.set(data.taskResultId, { cellKey: key, trialIndex: data.trialIndex });
  return trial;
}

function findTrial(
  state: RunStoreState,
  taskResultId: string,
): TrialState | null {
  const loc = state.byTaskResultId.get(taskResultId);
  if (!loc) return null;
  return state.cells.get(loc.cellKey)?.trials.get(loc.trialIndex) ?? null;
}

function recountProgress(state: RunStoreState): void {
  let scored = 0;
  let error = 0;
  let flagged = 0;
  let total = 0;
  for (const cell of state.cells.values()) {
    for (const trial of cell.trials.values()) {
      total += 1;
      if (trial.status === "scored") scored += 1;
      if (trial.status === "error") error += 1;
      if (trial.flagged) flagged += 1;
    }
  }
  state.run.progress = { scored, error, total, flagged };
}

function recomputeCellMedian(cell: CellState): void {
  const medians = [...cell.trials.values()]
    .map((t) => t.median)
    .filter((m): m is number => m != null);
  if (medians.length === 0) {
    cell.medianAcrossTrials = undefined;
    return;
  }
  const sorted = [...medians].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  cell.medianAcrossTrials =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid];
}

export type ApplyResult = {
  unknownCell: boolean;
  terminal: boolean;
  needsResync: boolean;
  notice?: { code: string; message: string };
};

/** Mutates `state` in place; returns flags for the stream hook. */
export function applySseEvent(
  state: RunStoreState,
  event: SseEvent,
  eventId: number | null,
): ApplyResult {
  if (eventId != null) state.lastEventId = eventId;

  const result: ApplyResult = {
    unknownCell: false,
    terminal: false,
    needsResync: false,
  };

  switch (event.event) {
    case "run.status": {
      state.run.status = event.data.status;
      state.run.spend.actual = event.data.totalCostUsd;
      state.run.progress.scored = event.data.progress.scored;
      state.run.progress.error = event.data.progress.error;
      state.run.progress.total = event.data.progress.total;
      if (isTerminal(event.data.status)) {
        result.terminal = true;
        state.connection = "closed";
      }
      break;
    }
    case "task.status": {
      const d = event.data;
      const existing = findTrial(state, d.taskResultId);
      if (!existing && !state.byTaskResultId.has(d.taskResultId)) {
        // Unknown cell — create from payload; if still missing context, resync
        if (!d.candidateModelId || !d.category) {
          result.unknownCell = true;
          break;
        }
      }
      const trial = ensureTrial(state, {
        taskResultId: d.taskResultId,
        taskId: d.taskId,
        category: d.category,
        candidateModelId: d.candidateModelId,
        trialIndex: d.trialIndex,
      });
      trial.status = d.status;
      if (d.error) trial.error = d.error;
      recountProgress(state);
      break;
    }
    case "candidate.delta": {
      const trial = findTrial(state, event.data.taskResultId);
      if (!trial) {
        result.unknownCell = true;
        break;
      }
      // Token-buffer ownership lives in useRunStream; store only tracks coarse tokens.
      if (event.data.tokens != null && event.data.tokens > trial.answer.tokens) {
        trial.answer.tokens = event.data.tokens;
      }
      if (trial.status === "pending") trial.status = "streaming";
      break;
    }
    case "candidate.complete": {
      const trial = findTrial(state, event.data.taskResultId);
      if (!trial) {
        result.unknownCell = true;
        break;
      }
      trial.answer.finishReason = event.data.finishReason;
      trial.answer.tokens = event.data.tokens.completion;
      trial.answer.promptTokens = event.data.tokens.prompt;
      trial.answer.costUsd = event.data.costUsd;
      trial.answer.latencyMs = event.data.latencyMs;
      break;
    }
    case "validation.complete": {
      const trial = findTrial(state, event.data.taskResultId);
      if (!trial) {
        result.unknownCell = true;
        break;
      }
      trial.checks = event.data.checks.map((c) => ({
        validator: c.validator,
        passed: c.passed,
        details: c.details,
        expected: c.expected,
        actual: c.actual,
        skipped:
          c.skipped ??
          (typeof c.details === "string" && c.details.startsWith("skipped:")),
        informational:
          c.informational ??
          (typeof c.details === "string" && c.details.startsWith("note:")),
      }));
      trial.allPassed = event.data.allPassed;
      if (trial.status === "streaming" || trial.status === "pending") {
        trial.status = "validating";
      }
      break;
    }
    case "judge.started": {
      const trial = findTrial(state, event.data.taskResultId);
      if (!trial) {
        result.unknownCell = true;
        break;
      }
      const prev = trial.judges.get(event.data.judgeModelId);
      trial.judges.set(event.data.judgeModelId, {
        judgeModelId: event.data.judgeModelId,
        parseStatus: prev?.parseStatus ?? "first_try",
        substituted: prev?.substituted ?? false,
        substitutedFor: prev?.substitutedFor ?? null,
        attempt: event.data.attempt,
        started: true,
        verdict: prev?.verdict,
        scores: prev?.scores,
        claimedOverall: prev?.claimedOverall,
        serverOverall: prev?.serverOverall,
        feedback: prev?.feedback,
        costUsd: prev?.costUsd,
        latencyMs: prev?.latencyMs,
      });
      if (trial.status !== "scored" && trial.status !== "error") {
        trial.status = "judging";
      }
      break;
    }
    case "judge.delta": {
      // Stream buffers owned by useRunStream; ensure judge entry exists.
      const trial = findTrial(state, event.data.taskResultId);
      if (!trial) {
        result.unknownCell = true;
        break;
      }
      if (!trial.judges.has(event.data.judgeModelId)) {
        trial.judges.set(event.data.judgeModelId, {
          judgeModelId: event.data.judgeModelId,
          parseStatus: "first_try",
          substituted: false,
          substitutedFor: null,
          attempt: 1,
          started: true,
        });
      }
      break;
    }
    case "judge.complete": {
      const trial = findTrial(state, event.data.taskResultId);
      if (!trial) {
        result.unknownCell = true;
        break;
      }
      const d = event.data;
      trial.judges.set(d.judgeModelId, {
        judgeModelId: d.judgeModelId,
        parseStatus: d.parseStatus,
        substituted: d.substituted,
        substitutedFor: d.substitutedFor,
        attempt: d.attempt,
        started: true,
        verdict: d.verdict,
        scores: d.scores,
        claimedOverall: d.claimedOverall,
        serverOverall: d.serverOverall,
        feedback: d.feedback
          ? {
              whatWasGood: d.feedback.whatWasGood,
              whatWasTerrible: d.feedback.whatWasTerrible,
              whatWasMissing: d.feedback.whatWasMissing,
              constraintViolations: d.feedback.constraintViolations,
              criticalErrors: d.feedback.criticalErrors,
              specificEvidence: d.feedback.specificEvidence,
              oneBestImprovement: d.feedback.oneBestImprovement,
            }
          : undefined,
        costUsd: d.costUsd,
        latencyMs: d.latencyMs,
      });
      break;
    }
    case "task.scored": {
      const d = event.data;
      const trial = ensureTrial(state, {
        taskResultId: d.taskResultId,
        taskId: d.taskId,
        category: d.category,
        candidateModelId: d.candidateModelId,
        trialIndex: d.trialIndex,
      });
      trial.status = "scored";
      trial.median = d.median;
      trial.spread = d.disagreement;
      trial.flagged = d.flagged;
      const loc = state.byTaskResultId.get(d.taskResultId);
      if (loc) {
        const cell = state.cells.get(loc.cellKey);
        if (cell) recomputeCellMedian(cell);
      }
      recountProgress(state);
      break;
    }
    case "run.cost": {
      state.run.spend.actual = event.data.totalCostUsd;
      state.run.spend.cap = event.data.budgetUsd;
      break;
    }
    case "notice": {
      state.run.notice = { code: event.data.code, message: event.data.message };
      result.notice = state.run.notice;
      break;
    }
    case "run.complete": {
      state.run.status = event.data.status;
      state.run.spend.actual = event.data.totalCostUsd;
      state.run.bundleRunScore = event.data.bundleRunScore;
      state.connection = "closed";
      result.terminal = true;
      break;
    }
    case "resync": {
      result.needsResync = true;
      break;
    }
    case "heartbeat": {
      // watchdog only
      break;
    }
    default: {
      // forward-compat: ignore unknown
      break;
    }
  }

  return result;
}

/** Clone store so useSyncExternalStore selectors see new cell/trial references. */
export function cloneStoreShallow(state: RunStoreState): RunStoreState {
  const cells = new Map<CellKey, CellState>();
  for (const [key, cell] of state.cells) {
    const trials = new Map<number, TrialState>();
    for (const [ti, trial] of cell.trials) {
      trials.set(ti, {
        ...trial,
        answer: { ...trial.answer },
        judges: new Map(
          [...trial.judges].map(([id, j]) => [id, { ...j, scores: j.scores ? { ...j.scores } : undefined, feedback: j.feedback ? { ...j.feedback } : undefined }]),
        ),
        checks: trial.checks?.map((c) => ({ ...c })),
        error: trial.error ? { ...trial.error } : undefined,
      });
    }
    cells.set(key, { ...cell, trials });
  }
  return {
    ...state,
    run: { ...state.run, spend: { ...state.run.spend }, progress: { ...state.run.progress } },
    cells,
    byTaskResultId: new Map(state.byTaskResultId),
    candidates: [...state.candidates],
    judgePool: [...state.judgePool],
  };
}
