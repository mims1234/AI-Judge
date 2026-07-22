/**
 * Shared analytics shapes — safe for client + server.
 * Keep SQLite access in `lib/server/analytics.ts` only.
 */

export type JudgeRollup = {
  judge_model_id: string;
  harshness_offset: number;
  variance: number;
  parse_fail_rate: number;
  mean_meta_score: number;
  mean_claim_mismatch: number;
  substitution_count: number;
  judgment_count: number;
};

export type JudgeDetail = {
  recentOveralls: Array<{ overall: number; panelMedian: number }>;
  flaggedJudgments: Array<{
    taskResultId: string;
    runId: string;
    category: string;
    candidate: string;
    spread: number;
    median: number;
    verdict: string | null;
    createdAt: string;
  }>;
  parseBreakdown: { firstTry: number; repaired: number; invalid: number };
};

export type CalibrationRow = {
  id: string;
  fixture: string;
  judge_model_id: string;
  evidence_quality: number | null;
  consistency: number | null;
  correctness: number | null;
  parse_status: "first_try" | "repaired" | "invalid";
  created_at: string;
};

export type ModelRunStats = {
  completeRuns: number;
  incompleteRuns: number;
  medianScore: number | null;
  q1: number | null;
  q3: number | null;
  scores: number[];
};

export type SameTaskAnswer = {
  modelId: string;
  found: boolean;
  runId: string | null;
  runDate: string | null;
  answer: string | null;
  median: number | null;
  spread: number | null;
  flagged: boolean;
  validatorsPassed: number;
  validatorsTotal: number;
  feedback: {
    good: string[];
    terrible: string[];
    missing: string[];
    improvements: string[];
  };
};
