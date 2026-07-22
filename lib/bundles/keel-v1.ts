/**
 * Keel v1 — engineering-depth instrument (plans/13, plans/14-keel-bundle.md).
 *
 * Distinct prompts from Octant/mini-benchmark-v1. Output schemas and validator
 * pins (math 552/432, roleplay counts, createIdempotencyGuard, poster/story
 * word rules) stay compatible with lib/validators so Backend need not change.
 */

import {
  CATEGORIES,
  JUDGE_OUTPUT_SCHEMA,
  JUDGE_PROMPT,
  MINI_V1,
  WRAPPER,
  computeContentHash,
  type Category,
  type MiniBundle,
  type TaskDefinition,
} from "@/lib/bundles/mini-v1";

export { computeContentHash };

/** Engineering-tilted task bodies — verbatim source: plans/14-keel-bundle.md */
const TASK_BODIES: Record<Category, string> = {
  roleplay: `Roleplay as a calm staff SRE coaching an on-call engineer during a cascading outage.

Situation:
A Kubernetes cluster shows rising 5xx rates after a Helm chart bump. The on-call engineer says:
"I rolled the deployment twice. Pods are Ready but latency spikes every few minutes. I think the mesh is broken."

Respond in character.

Requirements:
- Start by calming the engineer in one sentence.
- Ask exactly 3 high-value diagnostic questions.
- Give a safe 5-step immediate triage plan.
- Do not assume the root cause.
- Avoid destructive actions such as force-deleting namespaces, wiping PersistentVolumes, or cluster resets.
- End with one short sentence explaining what evidence would confirm the likely cause.

Output format:
{
  "response": "...",
  "diagnostic_questions": ["...", "...", "..."],
  "triage_steps": ["...", "...", "...", "...", "..."],
  "likely_evidence_needed": "..."
}`,

  coding: `Write a TypeScript function named \`createIdempotencyGuard\` for a high-throughput job worker.

Requirements:
- It accepts an object with \`key\`, \`ttlMs\`, optional \`maxEntries\` (default 10_000), and an async \`handler\` function.
- If the same key is currently being processed, return the same in-flight Promise instead of running handler again (single-flight / stampede protection).
- After successful completion, cache and return the result until ttlMs expires.
- If handler throws, do not cache the failure; a future call with the same key must retry.
- When the cache would exceed maxEntries, evict the oldest completed entry (FIFO among completed keys only; never evict in-flight keys).
- Use only in-memory JavaScript/TypeScript primitives; no libraries.
- Explain time and space complexity.
- Include at least 5 test cases covering concurrency, caching, expiry, eviction, and errors.

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

  math: `An infrastructure SaaS has 1,000 tenant accounts on the free and paid tiers.

- 60% of tenants are on the free plan.
- Of free-plan tenants, 8% convert to paid each month.
- Paid tenants have a 4% monthly churn rate.
- No new tenants join.
- Conversion happens before churn each month.
- A converted tenant cannot churn during the same month they convert.

Question:
After one month, how many free tenants and paid tenants are expected to remain?
Report them in the fields \`free_users_after_month_1\` and \`paid_users_after_month_1\` (tenants mapped to those field names for the validator).

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
For a small platform team running SQLite today, should they migrate primary OLTP storage to PostgreSQL or stay on SQLite + Litestream-style replication when the workloads are:
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
- In the comparison object, put PostgreSQL points under \`postgresql\` and SQLite/Litestream points under \`mongodb\` (schema key retained for validator compatibility; treat \`mongodb\` as the SQLite+Litestream side).

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

  marketing: `Create a launch message for an engineering product called "Keelwatch".

Product:
Keelwatch is a continuous profiling and deploy-regression detector for Node.js services. It correlates CPU/heap profiles with git SHAs and pages the owning team when a deploy worsens p99 latency.

Target audience:
Staff engineers and platform leads at companies with 5–40 production Node services.

Requirements:
- Create a landing-page hero section.
- Include headline, subheadline, 3 benefit bullets, and 2 CTAs.
- Write one 100-word launch post for X/Twitter.
- Do not make unprovable claims such as "zero false positives" or "100% coverage."
- Avoid generic phrases like "revolutionary" and "next generation."
- Focus on outcomes (faster incident triage, safer deploys), not only features.

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

  poster: `Write text for an internal engineering all-hands poster.

Event:
"Keel Failure Friday"
Date: Friday, 4 PM IST
Format: Live game-day — inject latency and disk pressure into a staging cluster for 90 minutes
Prize: Bragging rights + team lunch stipend
Audience: SREs, backend engineers, on-call volunteers
Registration: Free, limited to 40 participants

Requirements:
- Include a short headline of 2 to 5 words.
- Include a punchy tagline of no more than 12 words.
- Include all event details clearly.
- Include one call to action.
- The full text must be under 65 words.
- Tone: precise, technical, inviting.
- No emojis.

Output format:
{
  "headline": "...",
  "tagline": "...",
  "body": "...",
  "cta": "...",
  "word_count": number
}`,

  story: `Write a short science-fiction story grounded in systems engineering.

Premise:
A sole on-call engineer realizes their autoscaler has been quietly negotiating capacity with a neighboring datacenter that should not exist on the network map.

Requirements:
- 500 to 700 words.
- Third-person limited point of view.
- Set mostly during one late-night incident in a windowless NOC.
- Include a technical clue involving logs, metrics, or timestamps.
- The autoscaler must have a believable limitation; it cannot be omniscient.
- End with an emotionally satisfying but ambiguous final sentence.
- Do not use copyrighted characters or existing fictional universes.

Output format:
{
  "title": "...",
  "story": "..."
}`,

  judging: `You are evaluating two answers to the same question.

Question:
"Is it acceptable for a production Node.js API to catch all errors with an empty \`catch (e) {}\` so the process never crashes?"

Answer A:
"Yes. Uptime is the priority. Swallowing errors keeps the server alive. Log nothing because logs are expensive. Restart policies will handle real problems."

Answer B:
"No. Empty catches hide failures and make incidents undiagnosable. Catch at intentional boundaries, log with context, return safe error responses, and let truly fatal bugs crash so the supervisor restarts a clean process. Use structured logging and metrics for visibility."

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

function buildTasks(): TaskDefinition[] {
  const schemaByCategory = new Map(
    MINI_V1.tasks.map((t) => [
      t.category,
      { output_schema: t.output_schema, token_limit: t.token_limit },
    ]),
  );

  return CATEGORIES.map((category) => {
    const meta = schemaByCategory.get(category)!;
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

export const KEEL_V1: MiniBundle = {
  name: "keel",
  version: "1.0.0",
  slug: "keel-v1",
  status: "published",
  changelog:
    "Keel v1 — engineering-depth instrument: SRE triage, worker idempotency, tenant math, storage migration research, Keelwatch launch, failure-Friday poster, autoscaler story, empty-catch judging.",
  wrapper: WRAPPER,
  judge_output_schema: JUDGE_OUTPUT_SCHEMA,
  tasks: buildTasks(),
};

export function keelContentHash(): string {
  return computeContentHash(KEEL_V1);
}
