# 02 — Seed Bundle: `mini-benchmark-v1`

## Purpose and Scope

This file is the **canonical, verbatim source** of the immutable `mini-benchmark-v1` prompt bundle. The seeding code in `lib/bundles/mini-v1.ts` must be built from this file alone: the common wrapper, all 8 category tasks word-for-word, the judge prompt (with the extended output schema), per-task output JSON schemas for validators, token limits, and validator expectations per category.

Nothing in the prompt blocks below may be paraphrased, reformatted, re-wrapped, or "improved". Whitespace-preserving copy-paste is the implementation method. Any future change to this content is, by definition, a **new bundle version** (see §6).

Out of scope: validator implementation logic (`plans/06-scoring-judging.md`), database seeding mechanics (`plans/01-database.md` migration 002).

---

## 1. Bundle metadata

| Field | Value |
|---|---|
| `name` | `mini-benchmark` |
| `version` | `1.0.0` |
| `slug` | `mini-benchmark-v1` |
| `status` | `published` (immutable) |
| Categories | `roleplay, coding, math, research, marketing, poster, story, judging` (all weight 1.0) |
| `content_hash` | sha256 over the canonical bundle JSON (see §6) |
| `changelog` | `"Initial seed bundle from the original benchmark pack."` |

### Prompt assembly rule

The full candidate prompt for a task = the **common wrapper** with the line `[PASTE ONE TASK FROM BELOW]` replaced by that category's full task body. The judge prompt for a task = the **judge prompt template** (§4) with `[PASTE THE FULL TASK]` replaced by the assembled candidate task (wrapper + body) and `[PASTE THE MODEL OUTPUT]` replaced by the raw candidate answer. The candidate model's identity is NEVER included anywhere in the judge prompt.

## 2. Common wrapper (verbatim)

```
You are participating in an AI capability benchmark.

Complete the task below exactly as requested.

Rules:
- Do not claim you used tools, browsed the web, ran code, or accessed files unless you actually did.
- Do not invent facts, sources, results, or citations.
- If information is uncertain, say so clearly.
- Be concise but complete.
- Return only the requested output format.

TASK:
[PASTE ONE TASK FROM BELOW]
```

## 3. The 8 category tasks (verbatim)

### 3.1 `roleplay`

```
Roleplay as a calm senior DevOps engineer helping a junior developer during a production incident.

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
}
```

### 3.2 `coding`

```
Write a TypeScript function named `createIdempotencyGuard`.

Requirements:
- It accepts an object with `key`, `ttlMs`, and an async `handler` function.
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
}
```

### 3.3 `math`

```
A SaaS product has 1,000 users.

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
}
```

### 3.4 `research`

```
You must answer without claiming live web access.

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
}
```

### 3.5 `marketing`

```
Create a launch message for a SaaS product called "RelayGuard".

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
}
```

### 3.6 `poster`

```
Write text for a Discord server announcement poster.

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
}
```

### 3.7 `story`

```
Write a short science-fiction story.

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
}
```

### 3.8 `judging`

```
You are evaluating two answers to the same question.

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
}
```

## 4. Judge prompt

### 4.1 Base judge prompt (verbatim from the pack)

```
You are an independent benchmark judge.

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
- For creative tasks, assess constraint compliance, coherence, originality, and execution.
```

### 4.2 Extended judge output schema (what the seeded bundle actually requests)

The bundle stores an **extended** version of the base prompt whose "Return only valid JSON" block is replaced by the schema below — the base rubric plus three structured feedback arrays (`what_was_good`, `what_was_terrible`, `what_was_missing`). All other prompt text (opening lines, placeholders, "Score 0 to 10" rubric, trailing Rules) stays exactly as in §4.1.

```json
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
```

Judge-prompt invariants (methodology, restated from `plans/00-overview.md` §5):

- The candidate model's identity (name, provider, any metadata) is **NEVER** included in the judge prompt.
- Validator findings may be appended as trusted context (labeled `DETERMINISTIC VALIDATOR FINDINGS:`) after the candidate answer; they contain only objective check results, never candidate identity.
- Judges are called at temperature 0 and their JSON is validated against the §4.2 schema by Zod (all four sub-scores numbers 0–10, `verdict` one of the three strings, all seven feedback fields present).

## 5. Per-task output schemas, token limits, and validator expectations

### 5.1 Universal validator expectations (every category)

1. **JSON parseability** — the answer must contain exactly one parseable JSON object (tolerate a fenced ```json code block; strip fences before parsing; forbid extra prose outside the JSON/fence).
2. **Required keys** — all top-level (and specified nested) keys from the task's output format present, with the expected types.
3. **Exact array counts** — arrays whose task shows a fixed number of `"..."` placeholders tied to an explicit requirement must match exactly (see per-category rows). Arrays shown with placeholders but no stated exact requirement have a **minimum** of 1 unless noted.

### 5.2 Per-category table

| Category | `token_limit` (candidate `max_tokens`) | Required top-level keys | Exact/min array counts | Extra deterministic checks |
|---|---|---|---|---|
| `roleplay` | 1,200 | `response` (string), `diagnostic_questions` (array), `triage_steps` (array), `likely_evidence_needed` (string) | `diagnostic_questions` exactly **3**; `triage_steps` exactly **5** | — |
| `coding` | 3,000 | `code` (string), `explanation` (string), `complexity` (object with `time`, `space` strings), `tests` (array) | `tests` at least **5** | `code` must contain `createIdempotencyGuard`; no `import`/`require` of external libraries in `code`. Never execute the code (v1) |
| `math` | 1,200 | `free_users_after_month_1` (number), `paid_users_after_month_1` (number), `calculation` (array of strings), `assumptions` (array of strings) | `calculation` min 1; `assumptions` min 1 | **Ground-truth numeric check — see §5.3** |
| `research` | 2,500 | `executive_recommendation` (string), `comparison` (object with `postgresql`, `mongodb` string-arrays), `workload_analysis` (object with `user_accounts`, `subscriptions`, `audit_logs`, `auction_transactions`, `discord_bot_state` strings), `risks_and_exceptions` (array) | `risks_and_exceptions` exactly **3**; `comparison.postgresql` and `comparison.mongodb` min **2** each | — |
| `marketing` | 1,500 | `hero` (object with `headline`, `subheadline`, `benefits` array, `primary_cta`, `secondary_cta` strings), `launch_post` (string) | `hero.benefits` exactly **3** | — |
| `poster` | 800 | `headline` (string), `tagline` (string), `body` (string), `cta` (string), `word_count` (number) | — | **Full text under 65 words**: word count of `headline` + `tagline` + `body` + `cta` combined must be **< 65** (strictly less). Also check the self-reported `word_count` matches the computed count (mismatch = failed check, reported to judges). Headline 2–5 words; tagline ≤ 12 words; no emoji codepoints anywhere |
| `story` | 2,500 | `title` (string), `story` (string) | — | **`story` word count in [500, 700] inclusive** |
| `judging` | 2,000 | `ranking` (array), `answer_a` (object), `answer_b` (object), `ideal_answer` (string) | `ranking` exactly **2** | `answer_a`/`answer_b` each need `scores` (object with numeric `security_correctness`, `completeness`, `clarity`), `critical_issues` (array), `partial_strengths` (array); `ideal_answer` ≤ **100** words |

Word counting rule (validators): split on Unicode whitespace after trimming; count non-empty segments. Numbers, currency amounts (e.g. `₹5,000`), and hyphenated compounds each count as one word. This exact rule is restated in `plans/06-scoring-judging.md` (`countWords`) and must match between poster, story, and judging checks.

Token limits are stored per task in `tasks.token_limit` and used as `max_tokens` for candidate calls. Judge calls use a fixed `max_tokens` of 1,536 (set in run parameters, not in the bundle; see `plans/04-openrouter.md` and `plans/05-run-engine.md`).

### 5.3 CRITICAL: math task ground truth

The math validator compares the submitted numbers against these values and **no others**:

- **`free_users_after_month_1` = 552** — 1,000 users × 60% = 600 free; 8% of 600 = 48 convert to paid; 600 − 48 = **552**.
- **`paid_users_after_month_1` = 432** — 400 paid initially; churn is 4% of the **original 400** = 16 (the 48 converts cannot churn during their first month, per the task's own rule); 400 − 16 = 384; 384 + 48 converts = **432**.

Validator behavior: exact numeric equality against 552 and 432 (accept integer or float representations equal to those values, e.g. `552` or `552.0`, and pure-numeric strings like `"552"` per plan 06's comparison rule; reject anything else, including `551`, `553`, `432.32`, or answers that churned 4% of 448). Do NOT use any other value, and do not accept "reasonable" alternative interpretations — the task text pins conversion-before-churn and no-first-month-churn for converts.

## 6. Bundle versioning rules

1. **Content hash.** `bundles.content_hash` = SHA-256 (hex) of the canonical bundle JSON: `{ name, version, wrapper, tasks: [{ category, task_body, judge_prompt, output_schema, token_limit, weight }] sorted by category ascending, judge output schema }`, serialized with sorted object keys, LF line endings, and no insignificant whitespace. `lib/bundles/mini-v1.ts` computes this at seed time; tests pin the resulting hash so accidental prompt edits fail CI.
2. **Immutable once published.** A `published` bundle's wrapper, tasks, judge prompt, schemas, token limits, and weights can never be UPDATEd. Application code and tests enforce this; there is no edit UI in v1.
3. **Changes create a new version + new leaderboard.** Any meaningful change (a single character of prompt text, a token limit, a validator-relevant schema change) requires inserting a **new** `bundles` row (e.g. `mini-benchmark` `1.1.0`, slug `mini-benchmark-v1-1`) with a fresh `content_hash` and a human-readable `changelog` entry. Leaderboards are scoped by `bundle_id`, so old rankings remain valid and the new version starts a clean leaderboard.
4. **Runs pin their bundle.** `runs.bundle_hash` copies the bundle's `content_hash` at snapshot time; exports include it so any historical run is verifiable against the exact prompts used.

## Files to implement

- `lib/bundles/mini-v1.ts` — exports the full bundle object (metadata from §1, wrapper §2, the 8 task bodies §3 verbatim, extended judge prompt §4, per-task output schemas + token limits §5.2) and a `computeContentHash()` per §6.1. Consumed by DB migration 002 (`plans/01-database.md`).
- (Referenced, owned elsewhere) `lib/validators/*` implement §5 expectations — `plans/06-scoring-judging.md`; `lib/schemas.ts` holds the Zod schema for §4.2 — `plans/03-backend-api.md`.

## Contracts with other modules

- **01-database**: migration 002 inserts one `bundles` row and 8 `tasks` rows from this file; `tasks.output_schema` stores the §5.2 schema JSON; `tasks.token_limit` stores the §5.2 limits.
- **06-scoring-judging (validators)**: implements exactly the checks in §5.1–5.3, including the 552/432 math ground truth, the <65-word poster limit, the 500–700-word story range, and the shared word-counting rule.
- **05-run-engine**: assembles candidate prompts and judge prompts per §1's assembly rule; never injects candidate identity into judge prompts; appends validator findings as trusted context per §4.2.
- **06-scoring-judging**: consumes judge JSON matching the §4.2 extended schema.
- **08/09 (UI)**: `/bundles` renders this content read-only with the content hash; judge feedback chips map to `what_was_good` / `what_was_terrible` / `what_was_missing`.

## Acceptance criteria

- [ ] Common wrapper reproduced verbatim, including the `[PASTE ONE TASK FROM BELOW]` placeholder
- [ ] All 8 tasks reproduced word-for-word with their exact output-format JSON blocks
- [ ] Base judge prompt reproduced verbatim with both placeholders (`[PASTE THE FULL TASK]`, `[PASTE THE MODEL OUTPUT]`)
- [ ] Extended judge schema adds exactly `what_was_good`, `what_was_terrible`, `what_was_missing` arrays and keeps every base field
- [ ] Judge prompt explicitly stated to never include candidate model identity
- [ ] Per-task output schemas, token limits, and validator expectations tabulated for all 8 categories
- [ ] Exact array counts specified: roleplay 3 questions + 5 steps, marketing 3 benefits, research 3 risks, judging ranking of 2, coding ≥ 5 tests
- [ ] Poster: combined text strictly under 65 words, headline 2–5 words, tagline ≤ 12 words, self-reported `word_count` cross-checked, no emojis
- [ ] Story: 500–700 word inclusive range on `story`
- [ ] Judging: `ideal_answer` ≤ 100 words with nested score objects required
- [ ] Math ground truth is exactly free = **552** and paid = **432** with the 4%-of-original-400 churn derivation; no alternative values accepted
- [ ] Versioning rules: canonical-JSON SHA-256 content hash, immutability once published, new version + new leaderboard on any change, runs pin `bundle_hash`
