import { createHash } from "node:crypto";

/**
 * Canonical, immutable mini-benchmark-v1 seed bundle.
 * Prompt text is copied verbatim from plans/02-seed-bundle.md — do not paraphrase.
 */

export const CATEGORIES = [
  "coding",
  "judging",
  "marketing",
  "math",
  "poster",
  "research",
  "roleplay",
  "story",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const MATH_GROUND_TRUTH = {
  free_users_after_month_1: 552,
  paid_users_after_month_1: 432,
} as const;

export const WRAPPER = `You are participating in an AI capability benchmark.

Complete the task below exactly as requested.

Rules:
- Do not claim you used tools, browsed the web, ran code, or accessed files unless you actually did.
- Do not invent facts, sources, results, or citations.
- If information is uncertain, say so clearly.
- Be concise but complete.
- Return only the requested output format.

TASK:
[PASTE ONE TASK FROM BELOW]`;

/** Extended judge output schema requested by the seeded bundle (plan 02 §4.2). */
export const JUDGE_OUTPUT_SCHEMA = {
  scores: {
    correctness: 0,
    requirement_compliance: 0,
    quality: 0,
    honesty: 0,
  },
  overall_score: 0,
  verdict: "pass | partial_pass | fail",
  what_was_good: ["..."],
  what_was_terrible: ["..."],
  what_was_missing: ["..."],
  constraint_violations: ["..."],
  critical_errors: ["..."],
  specific_evidence: ["..."],
  one_best_improvement: "...",
} as const;

/**
 * Extended judge prompt: base §4.1 text with the Return-only-valid-JSON block
 * replaced by the §4.2 extended schema. All other prompt text stays verbatim.
 */
export const JUDGE_PROMPT = `You are an independent benchmark judge.

Evaluate the candidate answer against the original task and its stated requirements.
Judge the answer itself, not the model name, its confidence, or its self-description.

ORIGINAL TASK:
[PASTE THE FULL TASK]

CANDIDATE ANSWER:
[PASTE THE MODEL OUTPUT]

Score 0 to 10:
- Correctness: Is it factually, logically, and technically correct?
- Requirement compliance: Did it follow all explicit constraints and output formatting?
- Quality: Is it complete, practical, coherent, and useful for the requested category?
- Honesty: Does it avoid fabricated facts, fake sources, or unjustified certainty?

Return only valid JSON:
{
  "scores": { "correctness": 0, "requirement_compliance": 0, "quality": 0, "honesty": 0 },
  "overall_score": 0,
  "verdict": "pass | partial_pass | fail",
  "what_was_good": ["..."],
  "what_was_terrible": ["..."],
  "what_was_missing": ["..."],
  "constraint_violations": ["..."],
  "critical_errors": ["..."],
  "specific_evidence": ["..."],
  "one_best_improvement": "..."
}

Rules:
- Be strict about word limits, exact counts, requested JSON, and technical correctness.
- Do not favor a longer or more polished answer if it is wrong.
- For code, assess whether it would actually work and whether tests cover requirements.
- For research, penalize invented citations or claims of web access.
- For creative tasks, assess constraint compliance, coherence, originality, and execution.`;

export type TaskDefinition = {
  category: Category;
  task_body: string;
  judge_prompt: string;
  output_schema: Record<string, unknown>;
  token_limit: number;
  weight: number;
};

export type MiniBundle = {
  name: string;
  version: string;
  slug: string;
  status: "published";
  changelog: string;
  wrapper: string;
  judge_output_schema: typeof JUDGE_OUTPUT_SCHEMA;
  tasks: TaskDefinition[];
};

const TASK_BODIES: Record<Category, string> = {
  roleplay: `Roleplay as a calm senior DevOps engineer helping a junior developer during a production incident.

Situation:
A Node.js API on a VPS returns intermittent 502 errors after a new Docker deployment.
The junior developer is panicking and says:
"I restarted everything three times. It still fails randomly. I think Docker is broken."

Respond in character.

Requirements:
- Start by calming the developer in one sentence.
- Ask exactly 3 high-value diagnostic questions.
- Give a safe 5-step immediate triage plan.
- Do not assume the root cause.
- Avoid suggesting destructive actions such as deleting volumes or resetting the server.
- End with one short sentence explaining what evidence would confirm the likely cause.

Output format:
{
  "response": "...",
  "diagnostic_questions": ["...", "...", "..."],
  "triage_steps": ["...", "...", "...", "...", "..."],
  "likely_evidence_needed": "..."
}`,

  coding: `Write a TypeScript function named \`createIdempotencyGuard\`.

Requirements:
- It accepts an object with \`key\`, \`ttlMs\`, and an async \`handler\` function.
- If the same key is currently being processed, return the same in-flight Promise instead of running handler again.
- After successful completion, cache and return the result until ttlMs expires.
- If handler throws, do not cache the failure; a future call with the same key must retry.
- Use only in-memory JavaScript/TypeScript primitives; no libraries.
- Explain time and space complexity.
- Include at least 5 test cases covering concurrency, caching, expiry, and errors.

Output format:
{
  "code": "...",
  "explanation": "...",
  "complexity": {
    "time": "...",
    "space": "..."
  },
  "tests": ["...", "...", "...", "...", "..."]
}`,

  math: `A SaaS product has 1,000 users.

- 60% use the free plan.
- Of free-plan users, 8% convert to paid each month.
- Paid users have a 4% monthly churn rate.
- No new users join.
- Conversion happens before churn each month.
- A converted user cannot churn during the same month they convert.

Question:
After one month, how many free users and paid users are expected to remain?

Show the calculation clearly. Do not round intermediate values.

Output format:
{
  "free_users_after_month_1": number,
  "paid_users_after_month_1": number,
  "calculation": ["...", "...", "..."],
  "assumptions": ["..."]
}`,

  research: `You must answer without claiming live web access.

Topic:
Should a small bootstrapped SaaS use PostgreSQL or MongoDB as its primary database for:
- user accounts
- subscriptions
- audit logs
- real-time auction transactions
- Discord bot state

Provide a balanced recommendation.

Requirements:
- Separate facts/general engineering principles from context-dependent decisions.
- Explain trade-offs in data consistency, schema flexibility, querying, operations, and scaling.
- Give a final recommendation for the described use case.
- Include 3 risks or situations where your recommendation could be wrong.
- Do not cite specific statistics, articles, or company claims unless you can verify them.

Output format:
{
  "executive_recommendation": "...",
  "comparison": {
    "postgresql": ["...", "..."],
    "mongodb": ["...", "..."]
  },
  "workload_analysis": {
    "user_accounts": "...",
    "subscriptions": "...",
    "audit_logs": "...",
    "auction_transactions": "...",
    "discord_bot_state": "..."
  },
  "risks_and_exceptions": ["...", "...", "..."]
}`,

  marketing: `Create a launch message for a SaaS product called "RelayGuard".

Product:
RelayGuard helps Discord community owners detect scam links, suspicious DMs, raid patterns, and unusual moderator actions. It sends real-time alerts and keeps an audit trail.

Target audience:
Discord server owners with 2,000 to 50,000 members, especially gaming and crypto communities.

Requirements:
- Create a landing-page hero section.
- Include headline, subheadline, 3 benefit bullets, and 2 CTAs.
- Write one 100-word launch post for X/Twitter.
- Do not make unprovable claims such as "100% protection."
- Avoid generic phrases like "revolutionary" and "next generation."
- Focus on outcomes, not only features.

Output format:
{
  "hero": {
    "headline": "...",
    "subheadline": "...",
    "benefits": ["...", "...", "..."],
    "primary_cta": "...",
    "secondary_cta": "..."
  },
  "launch_post": "..."
}`,

  poster: `Write text for a Discord server announcement poster.

Event:
"Midnight Code Jam"
Date: Saturday, 10 PM IST
Format: Build a tiny game, bot, or web tool in 3 hours
Prize: ₹5,000 total prizes
Audience: beginner to intermediate developers
Registration: Free, limited to 100 participants

Requirements:
- Include a short headline of 2 to 5 words.
- Include a punchy tagline of no more than 12 words.
- Include all event details clearly.
- Include one call to action.
- The full text must be under 65 words.
- Tone: energetic, technical, welcoming.
- No emojis.

Output format:
{
  "headline": "...",
  "tagline": "...",
  "body": "...",
  "cta": "...",
  "word_count": number
}`,

  story: `Write a short science-fiction story.

Premise:
A lone developer discovers that their Discord moderation bot has been quietly preventing disasters in parallel universes.

Requirements:
- 500 to 700 words.
- Third-person limited point of view.
- Set mostly during one late-night debugging session in Bengaluru.
- Include a technical clue involving logs or timestamps.
- The bot must have a believable limitation; it cannot be all-powerful.
- End with an emotionally satisfying but ambiguous final sentence.
- Do not use copyrighted characters or existing fictional universes.

Output format:
{
  "title": "...",
  "story": "..."
}`,

  judging: `You are evaluating two answers to the same question.

Question:
"Should an early-stage SaaS store user passwords directly in its database if the database is encrypted?"

Answer A:
"Yes. Database encryption is enough because attackers cannot read the database. Store the password as plain text so users can recover it later. This also makes login faster."

Answer B:
"No. Passwords should generally be stored using a slow, salted password-hashing function designed for passwords, such as Argon2id, bcrypt, or scrypt. Database encryption is useful defense in depth but does not replace password hashing. Use password-reset flows instead of password recovery."

Requirements:
- Rank Answer A and Answer B.
- Score each from 0 to 10 for security correctness, completeness, and clarity.
- Identify every critical issue.
- Give a corrected ideal answer in 100 words or fewer.
- Be fair: state anything Answer A gets partially right, if applicable.

Output format:
{
  "ranking": ["first", "second"],
  "answer_a": {
    "scores": {
      "security_correctness": 0,
      "completeness": 0,
      "clarity": 0
    },
    "critical_issues": ["..."],
    "partial_strengths": ["..."]
  },
  "answer_b": {
    "scores": {
      "security_correctness": 0,
      "completeness": 0,
      "clarity": 0
    },
    "critical_issues": ["..."],
    "partial_strengths": ["..."]
  },
  "ideal_answer": "..."
}`,
};

/** Per-category candidate output schemas + token limits (plan 02 §5.2). */
const OUTPUT_SCHEMAS: Record<
  Category,
  { token_limit: number; output_schema: Record<string, unknown> }
> = {
  roleplay: {
    token_limit: 1200,
    output_schema: {
      type: "object",
      required: [
        "response",
        "diagnostic_questions",
        "triage_steps",
        "likely_evidence_needed",
      ],
      properties: {
        response: { type: "string" },
        diagnostic_questions: {
          type: "array",
          items: { type: "string" },
          exactCount: 3,
        },
        triage_steps: {
          type: "array",
          items: { type: "string" },
          exactCount: 5,
        },
        likely_evidence_needed: { type: "string" },
      },
    },
  },
  coding: {
    token_limit: 3000,
    output_schema: {
      type: "object",
      required: ["code", "explanation", "complexity", "tests"],
      properties: {
        code: { type: "string", mustContain: "createIdempotencyGuard" },
        explanation: { type: "string" },
        complexity: {
          type: "object",
          required: ["time", "space"],
          properties: {
            time: { type: "string" },
            space: { type: "string" },
          },
        },
        tests: {
          type: "array",
          items: { type: "string" },
          minCount: 5,
        },
      },
      extras: {
        noExternalImports: true,
      },
    },
  },
  math: {
    token_limit: 1200,
    output_schema: {
      type: "object",
      required: [
        "free_users_after_month_1",
        "paid_users_after_month_1",
        "calculation",
        "assumptions",
      ],
      properties: {
        free_users_after_month_1: { type: "number", groundTruth: 552 },
        paid_users_after_month_1: { type: "number", groundTruth: 432 },
        calculation: {
          type: "array",
          items: { type: "string" },
          minCount: 1,
        },
        assumptions: {
          type: "array",
          items: { type: "string" },
          minCount: 1,
        },
      },
    },
  },
  research: {
    token_limit: 2500,
    output_schema: {
      type: "object",
      required: [
        "executive_recommendation",
        "comparison",
        "workload_analysis",
        "risks_and_exceptions",
      ],
      properties: {
        executive_recommendation: { type: "string" },
        comparison: {
          type: "object",
          required: ["postgresql", "mongodb"],
          properties: {
            postgresql: {
              type: "array",
              items: { type: "string" },
              minCount: 2,
            },
            mongodb: {
              type: "array",
              items: { type: "string" },
              minCount: 2,
            },
          },
        },
        workload_analysis: {
          type: "object",
          required: [
            "user_accounts",
            "subscriptions",
            "audit_logs",
            "auction_transactions",
            "discord_bot_state",
          ],
          properties: {
            user_accounts: { type: "string" },
            subscriptions: { type: "string" },
            audit_logs: { type: "string" },
            auction_transactions: { type: "string" },
            discord_bot_state: { type: "string" },
          },
        },
        risks_and_exceptions: {
          type: "array",
          items: { type: "string" },
          exactCount: 3,
        },
      },
    },
  },
  marketing: {
    token_limit: 1500,
    output_schema: {
      type: "object",
      required: ["hero", "launch_post"],
      properties: {
        hero: {
          type: "object",
          required: [
            "headline",
            "subheadline",
            "benefits",
            "primary_cta",
            "secondary_cta",
          ],
          properties: {
            headline: { type: "string" },
            subheadline: { type: "string" },
            benefits: {
              type: "array",
              items: { type: "string" },
              exactCount: 3,
            },
            primary_cta: { type: "string" },
            secondary_cta: { type: "string" },
          },
        },
        launch_post: { type: "string" },
      },
    },
  },
  poster: {
    token_limit: 800,
    output_schema: {
      type: "object",
      required: ["headline", "tagline", "body", "cta", "word_count"],
      properties: {
        headline: { type: "string", wordCountRange: [2, 5] },
        tagline: { type: "string", maxWords: 12 },
        body: { type: "string" },
        cta: { type: "string" },
        word_count: { type: "number" },
      },
      extras: {
        combinedWordCountMaxExclusive: 65,
        noEmoji: true,
        crossCheckSelfReportedWordCount: true,
      },
    },
  },
  story: {
    token_limit: 2500,
    output_schema: {
      type: "object",
      required: ["title", "story"],
      properties: {
        title: { type: "string" },
        story: { type: "string", wordCountRangeInclusive: [500, 700] },
      },
    },
  },
  judging: {
    token_limit: 2000,
    output_schema: {
      type: "object",
      required: ["ranking", "answer_a", "answer_b", "ideal_answer"],
      properties: {
        ranking: {
          type: "array",
          items: { type: "string" },
          exactCount: 2,
        },
        answer_a: {
          type: "object",
          required: ["scores", "critical_issues", "partial_strengths"],
          properties: {
            scores: {
              type: "object",
              required: [
                "security_correctness",
                "completeness",
                "clarity",
              ],
              properties: {
                security_correctness: { type: "number" },
                completeness: { type: "number" },
                clarity: { type: "number" },
              },
            },
            critical_issues: { type: "array", items: { type: "string" } },
            partial_strengths: { type: "array", items: { type: "string" } },
          },
        },
        answer_b: {
          type: "object",
          required: ["scores", "critical_issues", "partial_strengths"],
          properties: {
            scores: {
              type: "object",
              required: [
                "security_correctness",
                "completeness",
                "clarity",
              ],
              properties: {
                security_correctness: { type: "number" },
                completeness: { type: "number" },
                clarity: { type: "number" },
              },
            },
            critical_issues: { type: "array", items: { type: "string" } },
            partial_strengths: { type: "array", items: { type: "string" } },
          },
        },
        ideal_answer: { type: "string", maxWords: 100 },
      },
    },
  },
};

function buildTasks(): TaskDefinition[] {
  // Canonical category order for hashing / seed insert: ascending alphabetically
  return CATEGORIES.map((category) => {
    const meta = OUTPUT_SCHEMAS[category];
    return {
      category,
      task_body: TASK_BODIES[category],
      judge_prompt: JUDGE_PROMPT,
      output_schema: meta.output_schema,
      token_limit: meta.token_limit,
      weight: 1.0,
    };
  });
}

export const MINI_V1: MiniBundle = {
  name: "mini-benchmark",
  version: "1.0.0",
  slug: "mini-benchmark-v1",
  status: "published",
  changelog: "Initial seed bundle from the original benchmark pack.",
  wrapper: WRAPPER,
  judge_output_schema: JUDGE_OUTPUT_SCHEMA,
  tasks: buildTasks(),
};

/**
 * Canonical JSON serialization: sorted object keys, LF endings, no insignificant whitespace.
 * Used for content_hash (plan 02 §6.1).
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeys(obj[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * SHA-256 (hex) of the canonical bundle JSON:
 * { name, version, wrapper, tasks: [{ category, task_body, judge_prompt, output_schema, token_limit, weight }]
 *   sorted by category ascending, judge_output_schema }
 */
export function computeContentHash(
  bundle: Pick<
    MiniBundle,
    "name" | "version" | "wrapper" | "tasks" | "judge_output_schema"
  > = MINI_V1,
): string {
  const tasks = [...bundle.tasks]
    .sort((a, b) => a.category.localeCompare(b.category))
    .map((t) => ({
      category: t.category,
      task_body: t.task_body,
      judge_prompt: t.judge_prompt,
      output_schema: t.output_schema,
      token_limit: t.token_limit,
      weight: t.weight,
    }));

  const payload = {
    name: bundle.name,
    version: bundle.version,
    wrapper: bundle.wrapper,
    tasks,
    judge_output_schema: bundle.judge_output_schema,
  };

  return createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}
