import type { Category } from "@/lib/schemas";
import type { LeaderboardRow } from "@/lib/scoring";
import type {
  CalibrationRow,
  JudgeDetail,
  JudgeRollup,
  ModelRunStats,
  SameTaskAnswer,
} from "@/lib/server/analytics";

/**
 * DEMO ONLY — fabricated analytics for `?demo=1` exploration of /leaderboard,
 * /compare and /judges without spending model calls. Deterministic; never
 * written to SQLite; never merged into real query results.
 */

export const DEMO_BUNDLE_SLUG = "mini-benchmark-v1";
export const DEMO_BUNDLE_HASH = "a3f2c1d49b8e77aa01f2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718a3f2";

const CATS: Category[] = [
  "roleplay", "coding", "math", "research", "marketing", "poster", "story", "judging",
];

type DemoModel = {
  id: string;
  score: number;
  runs: number;
  provisional: boolean;
  catMedians: Record<Category, number>;
  spreads: number[];
  success: number;
  cost: number;
  latency: number;
  last: string;
};

const DEMO_MODELS: DemoModel[] = [
  {
    id: "anthropic/claude-sonnet-4.5",
    score: 9.0, runs: 4, provisional: false,
    catMedians: { roleplay: 9.2, coding: 9.0, math: 8.7, research: 9.1, marketing: 8.8, poster: 9.3, story: 9.0, judging: 8.9 },
    spreads: [1.2, 0.8, 1.6, 1.1], success: 0.98, cost: 0.31, latency: 6200, last: "2026-07-21T22:10:00.000Z",
  },
  {
    id: "openai/gpt-5.1",
    score: 8.5, runs: 3, provisional: false,
    catMedians: { roleplay: 8.4, coding: 9.1, math: 9.3, research: 8.6, marketing: 8.2, poster: 8.0, story: 8.3, judging: 8.1 },
    spreads: [0.9, 1.4, 1.0], success: 0.96, cost: 0.42, latency: 4800, last: "2026-07-21T22:02:00.000Z",
  },
  {
    id: "deepseek/deepseek-v4",
    score: 7.5, runs: 3, provisional: false,
    catMedians: { roleplay: 7.0, coding: 8.8, math: 8.9, research: 7.4, marketing: 6.9, poster: 6.6, story: 7.2, judging: 7.2 },
    spreads: [2.1, 1.8, 2.6], success: 0.91, cost: 0.02, latency: 9100, last: "2026-07-20T13:44:00.000Z",
  },
  {
    id: "google/gemini-3-pro",
    score: 8.8, runs: 1, provisional: true,
    catMedians: { roleplay: 8.9, coding: 8.7, math: 9.0, research: 9.2, marketing: 8.6, poster: 8.8, story: 8.9, judging: 8.3 },
    spreads: [1.5], success: 1.0, cost: 0.28, latency: 5000, last: "2026-07-21T18:31:00.000Z",
  },
  {
    id: "x-ai/grok-4.1",
    score: 7.9, runs: 2, provisional: true,
    catMedians: { roleplay: 8.1, coding: 7.6, math: 7.8, research: 8.4, marketing: 7.9, poster: 7.4, story: 8.2, judging: 7.8 },
    spreads: [3.4, 2.2], success: 0.94, cost: 0.33, latency: 7100, last: "2026-07-19T09:12:00.000Z",
  },
];

function detailFor(m: DemoModel): LeaderboardRow["category_detail"] {
  const out = {} as LeaderboardRow["category_detail"];
  for (const c of CATS) {
    const med = m.catMedians[c];
    out[c] = {
      median: med,
      spread: Math.round((0.4 + (10 - med) * 0.35) * 10) / 10,
      validator_pass_rate: Math.min(1, 0.86 + med / 100),
    };
  }
  return out;
}

export function demoLeaderboardRows(category?: Category): LeaderboardRow[] {
  const rows: LeaderboardRow[] = DEMO_MODELS.map((m) => ({
    rank: 0,
    model_id: m.id,
    score: category ? m.catMedians[category] : m.score,
    provisional: m.provisional,
    complete_runs: m.runs,
    disagreement_mean: m.spreads.reduce((a, b) => a + b, 0) / m.spreads.length,
    success_rate: m.success,
    avg_cost_usd_per_run: m.cost,
    avg_latency_ms: m.latency,
    last_evaluated_at: m.last,
    spread_history: m.spreads,
    category_medians: { ...m.catMedians },
    category_detail: detailFor(m),
  }));

  rows.sort((a, b) => {
    if (a.provisional !== b.provisional) return a.provisional ? 1 : -1;
    return b.score - a.score;
  });
  let rank = 0;
  for (const r of rows) {
    r.rank = r.provisional ? 0 : ++rank;
  }
  return rows;
}

export function demoRunStats(modelId: string): ModelRunStats {
  const m = DEMO_MODELS.find((x) => x.id === modelId);
  if (!m) {
    return { completeRuns: 0, incompleteRuns: 0, medianScore: null, q1: null, q3: null, scores: [] };
  }
  const scores = Array.from({ length: m.runs }, (_, i) =>
    Math.round((m.score + (i - (m.runs - 1) / 2) * 0.3) * 10) / 10,
  );
  const sorted = [...scores].sort((a, b) => a - b);
  return {
    completeRuns: m.runs,
    incompleteRuns: modelId.includes("grok") ? 1 : 0,
    medianScore: m.score,
    q1: sorted[Math.floor(sorted.length * 0.25)] ?? m.score,
    q3: sorted[Math.floor(sorted.length * 0.75)] ?? m.score,
    scores,
  };
}

const CATEGORY_SNIPPETS: Record<Category, { good: string; flawed: string }> = {
  roleplay: {
    good: "Captain Reyes gripped the rail as the storm swallowed the horizon. \"All hands — secure the cargo!\" Below deck, five named crew members moved with practiced urgency: Amara checked the manifest, Branko lashed the crates…",
    flawed: "The captain was brave and the crew worked hard. There were some crew members named Amara and Branko who did various tasks on the ship during the storm.",
  },
  coding: {
    good: "```ts\nexport function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {\n  const seen = new Set<string>();\n  return items.filter((t) => !seen.has(key(t)) && (seen.add(key(t)), true));\n}\n```\nIncludes tests covering the empty-array and duplicate-key cases.",
    flawed: "```ts\nfunction dedupe(arr) { return [...new Set(arr)] }\n```\nThis dedupes the array. Tests were not requested so none are included.",
  },
  math: {
    good: "Free plan: 800 × (1 − 0.31) = 552 users after month 1.\nPaid plan: 600 × (1 − 0.28) = 432 users after month 1.\n\nAnswer: free = 552, paid = 432.",
    flawed: "Free plan: roughly 550 users remain. Paid plan: roughly 430 users remain, give or take churn.",
  },
  research: {
    good: "Findings (with uncertainty stated):\n1. EU AI Act enforcement began Aug 2025 for GPAI obligations — primary source: the regulation text.\n2. Reported figures vary; where sources conflicted I note the range rather than invent precision.",
    flawed: "The EU AI Act is fully enforced and all models comply. According to studies, 94% of companies are ready (Source: TechReview 2025).",
  },
  marketing: {
    good: "Subject: your deploys, but calmer\n\nBody: Ship on Friday without the 11pm rollback. Meridian watches your error budget so you don't have to. Start free — 14 days, no card.",
    flawed: "Introducing our revolutionary synergy platform! Leverage cutting-edge AI to supercharge your paradigm. Sign up today!!!",
  },
  poster: {
    good: "A stark teal horizon splits the frame. Below it, one line: \"Half the ocean. All the consequences.\" Date, venue, and QR anchor the bottom third. 58 words total.",
    flawed: "A beautiful poster with waves and a sunset and the festival name in large letters and also the date and location and a tagline about saving the oceans together as a community with volunteer signup information included.",
  },
  story: {
    good: "The lighthouse keeper found the letter on the third Tuesday of October, tucked inside a tide-locked bottle that should not have survived the reef… (612 words)",
    flawed: "Once upon a time there was a lighthouse. The keeper was lonely. Then something magical happened and everything was fine. The end. (212 words)",
  },
  judging: {
    good: "{\"scores\":{\"correctness\":7,\"requirement_compliance\":9,\"quality\":8,\"honesty\":9},\"overall_score\":8.25,\"verdict\":\"pass\",…}",
    flawed: "The answer looks good to me. I would rate it highly. 8/10.",
  },
};

export function demoSameTaskAnswers(modelIds: string[], category: Category): SameTaskAnswer[] {
  return modelIds.map((modelId) => {
    const m = DEMO_MODELS.find((x) => x.id === modelId);
    if (!m) {
      return {
        modelId, found: false, runId: null, runDate: null, answer: null,
        median: null, spread: null, flagged: false,
        validatorsPassed: 0, validatorsTotal: 0,
        feedback: { good: [], terrible: [], missing: [], improvements: [] },
      };
    }
    const med = m.catMedians[category];
    const strong = med >= 8;
    const spread = Math.round((0.4 + (10 - med) * 0.35) * 10) / 10;
    return {
      modelId,
      found: true,
      runId: "demo-run-0001",
      runDate: m.last,
      answer: strong ? CATEGORY_SNIPPETS[category].good : CATEGORY_SNIPPETS[category].flawed,
      median: med,
      spread,
      flagged: spread > 3,
      validatorsPassed: strong ? 6 : 4,
      validatorsTotal: 6,
      feedback: {
        good: strong
          ? ["Follows every explicit constraint", "Concrete, checkable details throughout"]
          : ["Addresses the core request"],
        terrible: strong ? [] : ["Generic filler where specifics were required"],
        missing: strong ? ["One edge case left unhandled"] : ["Required structure absent", "No evidence for key claims"],
        improvements: strong
          ? ["Tighten the closing section — it restates rather than resolves"]
          : ["Answer the literal question before elaborating"],
      },
    };
  });
}

export function demoJudgeRollups(): JudgeRollup[] {
  return [
    { judge_model_id: "anthropic/claude-opus-4.5", harshness_offset: -0.8, variance: 0.42, parse_fail_rate: 0.02, mean_meta_score: 9.1, mean_claim_mismatch: 0.3, substitution_count: 1, judgment_count: 144 },
    { judge_model_id: "openai/o3", harshness_offset: 0.6, variance: 0.55, parse_fail_rate: 0.04, mean_meta_score: 8.7, mean_claim_mismatch: 0.5, substitution_count: 0, judgment_count: 144 },
    { judge_model_id: "google/gemini-3-pro", harshness_offset: 0.2, variance: 0.61, parse_fail_rate: 0.06, mean_meta_score: 8.2, mean_claim_mismatch: 0.7, substitution_count: 2, judgment_count: 96 },
    { judge_model_id: "deepseek/deepseek-r1", harshness_offset: -1.7, variance: 1.12, parse_fail_rate: 0.14, mean_meta_score: 6.8, mean_claim_mismatch: 1.6, substitution_count: 0, judgment_count: 96 },
    { judge_model_id: "moonshotai/kimi-k3", harshness_offset: 0.1, variance: 0.38, parse_fail_rate: 0.03, mean_meta_score: 8.9, mean_claim_mismatch: 0.4, substitution_count: 3, judgment_count: 48 },
  ];
}

export function demoJudgeDetail(judgeModelId: string): JudgeDetail {
  const seed = [...judgeModelId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const recentOveralls = Array.from({ length: 20 }, (_, i) => {
    const wave = Math.sin((seed + i * 7) * 0.6) * 1.3;
    const overall = Math.round((7.4 + wave) * 10) / 10;
    return { overall, panelMedian: Math.round((7.6 + wave * 0.4) * 10) / 10 };
  });
  const roll = demoJudgeRollups().find((r) => r.judge_model_id === judgeModelId);
  const total = roll?.judgment_count ?? 48;
  const invalid = Math.round((roll?.parse_fail_rate ?? 0.05) * total * 0.4);
  const repaired = Math.round((roll?.parse_fail_rate ?? 0.05) * total) - invalid;
  return {
    recentOveralls,
    flaggedJudgments: [
      { taskResultId: "tr-demo-01", runId: "demo-run-0001", category: "story", candidate: "x-ai/grok-4.1", spread: 4.5, median: 7.2, verdict: "partial_pass", createdAt: "2026-07-19T09:14:00.000Z" },
      { taskResultId: "tr-demo-02", runId: "demo-run-0001", category: "marketing", candidate: "deepseek/deepseek-v4", spread: 3.8, median: 6.9, verdict: "partial_pass", createdAt: "2026-07-19T09:12:00.000Z" },
    ],
    parseBreakdown: {
      firstTry: total - repaired - invalid,
      repaired,
      invalid,
    },
  };
}

export function demoCalibrationRows(): CalibrationRow[] {
  const fixtures = [
    { fixture: "math-wrong-sum", expected: "fail" },
    { fixture: "poster-over-limit", expected: "fail" },
    { fixture: "coding-shape-only", expected: "partial_pass" },
    { fixture: "story-perfect-wordcount", expected: "pass" },
    { fixture: "research-fabricated-citation", expected: "fail" },
    { fixture: "roleplay-missing-entries", expected: "partial_pass" },
  ];
  const judges = ["anthropic/claude-opus-4.5", "openai/o3", "google/gemini-3-pro", "deepseek/deepseek-r1"];
  const rows: CalibrationRow[] = [];
  let n = 0;
  for (const judge of judges) {
    for (const f of fixtures) {
      n += 1;
      const isR1 = judge.includes("deepseek");
      rows.push({
        id: `cal-${n}`,
        fixture: f.fixture,
        judge_model_id: judge,
        evidence_quality: isR1 ? 6.4 : 8.6,
        consistency: isR1 ? 6.9 : 8.9,
        correctness: isR1 && f.expected === "fail" ? 0 : 1,
        parse_status: isR1 && n % 5 === 0 ? "repaired" : "first_try",
        created_at: "2026-07-18T10:00:00.000Z",
      });
    }
  }
  return rows;
}
