import { z } from "zod";

/** Exact 8 category names (lowercase) — shared contract. */
export const CategorySchema = z.enum([
  "roleplay",
  "coding",
  "math",
  "research",
  "marketing",
  "poster",
  "story",
  "judging",
]);
export type Category = z.infer<typeof CategorySchema>;

export const CATEGORY_ORDER: Category[] = [
  "roleplay",
  "coding",
  "math",
  "research",
  "marketing",
  "poster",
  "story",
  "judging",
];

export const TaskResultStatusSchema = z.enum([
  "pending",
  "streaming",
  "validating",
  "judging",
  "scored",
  "error",
]);
export type TaskResultStatus = z.infer<typeof TaskResultStatusSchema>;

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "paused",
  "completed",
  "cancelled",
  "incomplete",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const VerdictSchema = z.enum(["pass", "partial_pass", "fail"]);
export type Verdict = z.infer<typeof VerdictSchema>;
export const ParseStatusSchema = z.enum(["first_try", "repaired", "invalid"]);

const Score0to10 = z.coerce.number().min(0).max(10);

/** Judge structured output (plan 06 / seed bundle §4.2). */
export const JudgeOutputSchema = z.object({
  scores: z.object({
    correctness: Score0to10,
    requirement_compliance: Score0to10,
    quality: Score0to10,
    honesty: Score0to10,
  }),
  overall_score: Score0to10,
  verdict: VerdictSchema,
  what_was_good: z.array(z.string()),
  what_was_terrible: z.array(z.string()),
  what_was_missing: z.array(z.string()),
  constraint_violations: z.array(z.string()),
  critical_errors: z.array(z.string()),
  specific_evidence: z.array(z.string()),
  one_best_improvement: z.string(),
});
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

/**
 * Hand-written JSON Schema for OpenRouter structured outputs.
 * Stable wire schema — not runtime-derived from Zod.
 */
export const judgeOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "scores",
    "overall_score",
    "verdict",
    "what_was_good",
    "what_was_terrible",
    "what_was_missing",
    "constraint_violations",
    "critical_errors",
    "specific_evidence",
    "one_best_improvement",
  ],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: [
        "correctness",
        "requirement_compliance",
        "quality",
        "honesty",
      ],
      properties: {
        correctness: { type: "number", minimum: 0, maximum: 10 },
        requirement_compliance: { type: "number", minimum: 0, maximum: 10 },
        quality: { type: "number", minimum: 0, maximum: 10 },
        honesty: { type: "number", minimum: 0, maximum: 10 },
      },
    },
    overall_score: { type: "number", minimum: 0, maximum: 10 },
    verdict: { type: "string", enum: ["pass", "partial_pass", "fail"] },
    what_was_good: { type: "array", items: { type: "string" } },
    what_was_terrible: { type: "array", items: { type: "string" } },
    what_was_missing: { type: "array", items: { type: "string" } },
    constraint_violations: { type: "array", items: { type: "string" } },
    critical_errors: { type: "array", items: { type: "string" } },
    specific_evidence: { type: "array", items: { type: "string" } },
    one_best_improvement: { type: "string" },
  },
} as const;

/** Lenient OpenRouter model catalog entry (plan 04). */
export const OpenRouterModelSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    context_length: z.number().optional().nullable(),
    pricing: z
      .object({
        prompt: z.union([z.string(), z.number()]).optional(),
        completion: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional()
      .nullable(),
    supported_parameters: z.array(z.string()).optional().nullable(),
    architecture: z
      .object({
        input_modalities: z.array(z.string()).optional(),
        output_modalities: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional()
      .nullable(),
  })
  .passthrough();

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().nullable().optional(),
  }),
});

const PricingSchema = z.object({
  prompt_usd_per_m: z.number(),
  completion_usd_per_m: z.number(),
});

export const CatalogModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  context_length: z.number(),
  pricing: PricingSchema.nullable(),
  supports_structured_outputs: z.boolean(),
  is_free: z.boolean(),
});

export const ModelsResponseSchema = z.object({
  source: z.enum(["cache", "stale", "network"]),
  fetched_at: z.string(),
  models: z.array(CatalogModelSchema),
});

const uniqueStrings = (min: number, max: number) =>
  z
    .array(z.string().min(1))
    .min(min)
    .max(max)
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "must be unique",
    });

export const PreflightRequestSchema = z.object({
  bundle_id: z.string().min(1),
  candidate_model_ids: uniqueStrings(1, 8),
  judge_pool_model_ids: uniqueStrings(3, 12),
  categories: z.array(CategorySchema).min(1).default([...CATEGORY_ORDER]),
  trials_per_pair: z.number().int().min(1).max(5).default(1),
  candidate_concurrency: z.number().int().min(1).max(4).default(1),
  budget_usd: z.number().positive().max(500).optional().nullable(),
  seed: z.number().int().optional(),
});
export type PreflightRequest = z.infer<typeof PreflightRequestSchema>;

const IssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const PreflightResponseSchema = z.object({
  ok: z.boolean(),
  seed: z.number().int(),
  errors: z.array(IssueSchema),
  warnings: z.array(IssueSchema),
  estimate: z.object({
    request_count: z.number(),
    candidate_requests: z.number(),
    judge_requests: z.number(),
    prompt_tokens_est: z.number(),
    completion_tokens_est: z.number(),
    cost_usd_min: z.number(),
    cost_usd_expected: z.number(),
    cost_usd_max: z.number(),
    duration_est_seconds: z.number(),
    unpriced_models: z.array(z.string()).optional(),
  }),
});
export type PreflightResponse = z.infer<typeof PreflightResponseSchema>;

export const CreateRunRequestSchema = PreflightRequestSchema.extend({
  seed: z.number().int(),
  idempotency_key: z.string().min(1).optional(),
});
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

export const CreateRunResponseSchema = z.object({
  run_id: z.string(),
  status: z.literal("queued"),
  events_url: z.string(),
});

export const RunListQuerySchema = z.object({
  status: RunStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const RunListResponseSchema = z.object({
  runs: z.array(
    z.object({
      id: z.string(),
      bundle_id: z.string(),
      status: RunStatusSchema,
      created_at: z.string(),
      total_cost_usd: z.number(),
    }),
  ),
});

const ScoresObjectSchema = z.object({
  correctness: z.number(),
  requirement_compliance: z.number(),
  quality: z.number(),
  honesty: z.number(),
});

export const RunSnapshotSchema = z.object({
  run: z.object({
    id: z.string(),
    bundle_id: z.string(),
    bundle_hash: z.string(),
    seed: z.number(),
    status: RunStatusSchema,
    parameters: z.record(z.string(), z.unknown()),
    budget_usd: z.number().nullable(),
    total_cost_usd: z.number(),
    started_at: z.string().nullable(),
    finished_at: z.string().nullable(),
    last_event_id: z.number(),
  }),
  candidates: z.array(z.string()),
  judge_pool: z.array(z.string()),
  panels: z.array(
    z.object({
      category: CategorySchema,
      panel_seed: z.number(),
      judges: z.array(z.string()),
      reserves: z.array(z.string()),
    }),
  ),
  task_results: z.array(
    z.object({
      id: z.string(),
      task_id: z.string(),
      category: CategorySchema,
      candidate_model_id: z.string(),
      trial_index: z.number(),
      status: TaskResultStatusSchema,
      raw_output: z.string().nullable(),
      finish_reason: z.string().nullable(),
      tokens: z
        .object({ prompt: z.number(), completion: z.number() })
        .nullable(),
      cost_usd: z.number().nullable(),
      latency_ms: z.number().nullable(),
      error: z
        .object({
          kind: z.enum(["infra_failure", "judging_failure"]),
          message: z.string(),
        })
        .nullable(),
      validator_results: z.array(
        z.object({
          validator: z.string(),
          passed: z.boolean(),
          details: z.string(),
          expected: z.string().optional(),
          actual: z.string().optional(),
        }),
      ),
      judgments: z.array(
        z.object({
          judge_model_id: z.string(),
          parse_status: ParseStatusSchema,
          is_substitute: z.boolean(),
          scores: ScoresObjectSchema.nullable().optional(),
          claimed_overall: z.number().nullable().optional(),
          computed_overall: z.number().nullable().optional(),
          verdict: VerdictSchema.nullable().optional(),
          what_was_good: z.array(z.string()).optional(),
          what_was_terrible: z.array(z.string()).optional(),
          what_was_missing: z.array(z.string()).optional(),
          constraint_violations: z.array(z.string()).optional(),
          critical_errors: z.array(z.string()).optional(),
          specific_evidence: z.array(z.string()).optional(),
          one_best_improvement: z.string().optional(),
        }),
      ),
      aggregate: z
        .object({
          median_overall: z.number(),
          disagreement: z.number(),
          flagged: z.boolean(),
        })
        .nullable(),
    }),
  ),
  bundle_run_score: z.number().nullable(),
});
export type RunSnapshot = z.infer<typeof RunSnapshotSchema>;

export const RunControlResponseSchema = z.object({
  run_id: z.string(),
  status: RunStatusSchema,
});

export const RetryTaskResponseSchema = z.object({
  run_id: z.string(),
  task_result_id: z.string(),
  status: z.literal("pending"),
});

export const LeaderboardQuerySchema = z.object({
  bundle: z.string().min(1),
  category: CategorySchema.optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export const LeaderboardResponseSchema = z.object({
  bundle_id: z.string(),
  bundle_hash: z.string(),
  category: CategorySchema.nullable(),
  rows: z.array(
    z.object({
      rank: z.number(),
      model_id: z.string(),
      score: z.number(),
      provisional: z.boolean(),
      complete_runs: z.number(),
      disagreement_mean: z.number(),
      success_rate: z.number(),
      avg_cost_usd_per_run: z.number(),
      avg_latency_ms: z.number(),
      last_evaluated_at: z.string().nullable(),
      spread_history: z.array(z.number()),
      category_medians: z.record(z.string(), z.number()),
      category_detail: z.record(
        z.string(),
        z.object({
          median: z.number(),
          spread: z.number(),
          validator_pass_rate: z.number(),
        }),
      ),
    }),
  ),
});

export const ExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});

/* ---------- SSE event schemas (discriminated union on event name) ---------- */

const RunIdField = z.object({ runId: z.string() });

export const SseRunStatusSchema = z.object({
  event: z.literal("run.status"),
  data: RunIdField.extend({
    status: RunStatusSchema,
    totalCostUsd: z.number(),
    progress: z.object({
      scored: z.number(),
      error: z.number(),
      total: z.number(),
    }),
    elapsedMs: z.number(),
  }),
});

export const SseTaskStatusSchema = z.object({
  event: z.literal("task.status"),
  data: RunIdField.extend({
    taskResultId: z.string(),
    taskId: z.string(),
    category: CategorySchema,
    candidateModelId: z.string(),
    trialIndex: z.number(),
    status: TaskResultStatusSchema,
    error: z
      .object({
        kind: z.enum(["infra_failure", "judging_failure"]),
        message: z.string(),
      })
      .optional(),
  }),
});

export const SseCandidateDeltaSchema = z.object({
  event: z.literal("candidate.delta"),
  data: RunIdField.extend({
    taskResultId: z.string(),
    delta: z.string(),
    tokens: z.number().optional(),
  }),
});

export const SseCandidateCompleteSchema = z.object({
  event: z.literal("candidate.complete"),
  data: RunIdField.extend({
    taskResultId: z.string(),
    finishReason: z.string(),
    tokens: z.object({ prompt: z.number(), completion: z.number() }),
    costUsd: z.number(),
    latencyMs: z.number(),
  }),
});

export const SseValidationCompleteSchema = z.object({
  event: z.literal("validation.complete"),
  data: RunIdField.extend({
    taskResultId: z.string(),
    checks: z.array(
      z.object({
        validator: z.string(),
        passed: z.boolean(),
        expected: z.string().optional(),
        actual: z.string().optional(),
        details: z.string(),
      }),
    ),
    allPassed: z.boolean(),
  }),
});

export const SseJudgeStartedSchema = z.object({
  event: z.literal("judge.started"),
  data: RunIdField.extend({
    taskResultId: z.string(),
    judgeModelId: z.string(),
    attempt: z.number(),
  }),
});

export const SseJudgeDeltaSchema = z.object({
  event: z.literal("judge.delta"),
  data: RunIdField.extend({
    taskResultId: z.string(),
    judgeModelId: z.string(),
    delta: z.string(),
  }),
});

export const SseJudgeCompleteSchema = z.object({
  event: z.literal("judge.complete"),
  data: RunIdField.extend({
    taskResultId: z.string(),
    judgeModelId: z.string(),
    attempt: z.number(),
    parseStatus: ParseStatusSchema,
    substituted: z.boolean(),
    substitutedFor: z.string().nullable(),
    verdict: VerdictSchema.optional(),
    scores: ScoresObjectSchema.optional(),
    claimedOverall: z.number().optional(),
    serverOverall: z.number().optional(),
    feedback: z
      .object({
        whatWasGood: z.array(z.string()),
        whatWasTerrible: z.array(z.string()),
        whatWasMissing: z.array(z.string()),
        constraintViolations: z.array(z.string()),
        criticalErrors: z.array(z.string()),
        specificEvidence: z.array(z.string()),
        oneBestImprovement: z.string(),
      })
      .optional(),
    costUsd: z.number(),
    latencyMs: z.number(),
  }),
});

export const SseTaskScoredSchema = z.object({
  event: z.literal("task.scored"),
  data: RunIdField.extend({
    taskResultId: z.string(),
    taskId: z.string(),
    category: CategorySchema,
    candidateModelId: z.string(),
    trialIndex: z.number(),
    median: z.number(),
    disagreement: z.number(),
    flagged: z.boolean(),
    judgeOveralls: z.array(z.number()),
  }),
});

export const SseRunCostSchema = z.object({
  event: z.literal("run.cost"),
  data: RunIdField.extend({
    totalCostUsd: z.number(),
    budgetUsd: z.number().nullable(),
  }),
});

export const SseNoticeSchema = z.object({
  event: z.literal("notice"),
  data: RunIdField.extend({
    scope: z.enum(["run", "task"]),
    code: z.string(),
    message: z.string(),
    taskResultId: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const SseRunCompleteSchema = z.object({
  event: z.literal("run.complete"),
  data: RunIdField.extend({
    status: z.enum(["completed", "cancelled", "incomplete"]),
    bundleRunScore: z.number().nullable(),
    totalCostUsd: z.number(),
  }),
});

export const SseResyncSchema = z.object({
  event: z.literal("resync"),
  data: RunIdField.extend({
    lastEventId: z.number(),
  }),
});

export const SseHeartbeatSchema = z.object({
  event: z.literal("heartbeat"),
  data: RunIdField.extend({
    ts: z.number(),
  }),
});

export const SseEventSchema = z.discriminatedUnion("event", [
  SseRunStatusSchema,
  SseTaskStatusSchema,
  SseCandidateDeltaSchema,
  SseCandidateCompleteSchema,
  SseValidationCompleteSchema,
  SseJudgeStartedSchema,
  SseJudgeDeltaSchema,
  SseJudgeCompleteSchema,
  SseTaskScoredSchema,
  SseRunCostSchema,
  SseNoticeSchema,
  SseRunCompleteSchema,
  SseResyncSchema,
  SseHeartbeatSchema,
]);
export type SseEvent = z.infer<typeof SseEventSchema>;

/** Event types that are never persisted to run_events. */
export const EPHEMERAL_SSE_EVENTS = new Set([
  "candidate.delta",
  "judge.delta",
  "heartbeat",
  "resync",
]);
