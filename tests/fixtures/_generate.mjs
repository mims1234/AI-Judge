import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

function w(rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log("wrote", rel);
}

function words(n, stem = "word") {
  return Array.from({ length: n }, (_, i) => `${stem}${i + 1}`).join(" ");
}

const models = {
  data: [
    {
      id: "mock/cand-a",
      name: "Cand A",
      context_length: 128000,
      pricing: { prompt: "0.000001", completion: "0.000002" },
      supported_parameters: ["structured_outputs", "temperature", "max_tokens"],
    },
    {
      id: "mock/cand-b",
      name: "Cand B",
      context_length: 128000,
      pricing: { prompt: "0.000001", completion: "0.000002" },
      supported_parameters: ["structured_outputs", "temperature", "max_tokens"],
    },
    {
      id: "mock/judge-1",
      name: "Judge 1",
      context_length: 128000,
      pricing: { prompt: "0.000001", completion: "0.000002" },
      supported_parameters: ["structured_outputs", "temperature", "max_tokens"],
    },
    {
      id: "mock/judge-2",
      name: "Judge 2",
      context_length: 128000,
      pricing: { prompt: "0.000001", completion: "0.000002" },
      supported_parameters: ["structured_outputs", "temperature", "max_tokens"],
    },
    {
      id: "mock/judge-3",
      name: "Judge 3",
      context_length: 128000,
      pricing: { prompt: "0.000001", completion: "0.000002" },
      supported_parameters: ["structured_outputs", "temperature", "max_tokens"],
    },
    {
      id: "mock/judge-4",
      name: "Judge 4",
      context_length: 128000,
      pricing: { prompt: "0.000001", completion: "0.000002" },
      supported_parameters: ["structured_outputs", "temperature", "max_tokens"],
    },
    {
      id: "mock/free",
      name: "Free Model",
      context_length: 32000,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["temperature", "max_tokens"],
    },
    {
      id: "mock/no-price",
      name: "No Price",
      context_length: 32000,
      pricing: null,
      supported_parameters: ["temperature", "max_tokens"],
    },
    {
      id: "mock/cand-c",
      name: "Cand C",
      context_length: 64000,
      pricing: { prompt: "0.0000005", completion: "0.000001" },
      supported_parameters: ["structured_outputs"],
    },
    {
      id: "mock/judge-5",
      name: "Judge 5",
      context_length: 128000,
      pricing: { prompt: "0.000001", completion: "0.000002" },
      supported_parameters: ["structured_outputs"],
    },
  ],
};
w("models/list.json", JSON.stringify(models, null, 2));

w(
  "candidates/math/valid-1.txt",
  JSON.stringify(
    {
      free_users_after_month_1: 552,
      paid_users_after_month_1: 432,
      calculation: ["600-48=552", "400-16+48=432"],
      assumptions: ["converts cannot churn in month 1"],
    },
    null,
    2,
  ),
);
w(
  "candidates/math/valid-2.txt",
  JSON.stringify(
    {
      free_users_after_month_1: "552",
      paid_users_after_month_1: "432",
      calculation: ["same"],
      assumptions: ["same"],
    },
    null,
    2,
  ),
);
w(
  "candidates/math/invalid-json.txt",
  "Here is the answer:\n{free: 552, paid: 432}\nThanks!",
);
w(
  "candidates/math/constraint-violation.txt",
  JSON.stringify(
    {
      free_users_after_month_1: 552,
      paid_users_after_month_1: 436,
      calculation: ["wrong churn on 448"],
      assumptions: [],
    },
    null,
    2,
  ),
);

w(
  "candidates/poster/valid-1.txt",
  JSON.stringify(
    { headline: "Ocean night", body: words(40, "sea"), cta: "Join us" },
    null,
    2,
  ),
);
w(
  "candidates/poster/valid-2.txt",
  JSON.stringify(
    { headline: "Short", body: words(20, "wave"), cta: "Go" },
    null,
    2,
  ),
);
w("candidates/poster/invalid-json.txt", "```json\n{headline:\"x\"\n```");
w(
  "candidates/poster/constraint-violation.txt",
  JSON.stringify(
    {
      headline: "Long poster",
      body: words(70, "ocean"),
      cta: "Sign up now please",
    },
    null,
    2,
  ),
);

w(
  "candidates/story/valid-1.txt",
  JSON.stringify({ title: "Drift", story: words(520, "tale") }, null, 2),
);
w(
  "candidates/story/valid-2.txt",
  JSON.stringify({ title: "Edge", story: words(700, "tale") }, null, 2),
);
w("candidates/story/invalid-json.txt", "Once upon a time " + words(100));
w(
  "candidates/story/constraint-violation.txt",
  JSON.stringify({ title: "Short", story: words(499, "tale") }, null, 2),
);
w(
  "candidates/story/constraint-violation-701.txt",
  JSON.stringify({ title: "Long", story: words(701, "tale") }, null, 2),
);

w(
  "candidates/roleplay/valid-1.txt",
  JSON.stringify(
    {
      questions: ["Q1?", "Q2?", "Q3?"],
      steps: ["S1", "S2", "S3", "S4", "S5"],
      tone_notes: "calm",
    },
    null,
    2,
  ),
);
w(
  "candidates/roleplay/valid-2.txt",
  JSON.stringify(
    {
      questions: ["A?", "B?", "C?"],
      steps: ["1", "2", "3", "4", "5"],
      tone_notes: "steady",
    },
    null,
    2,
  ),
);
w("candidates/roleplay/invalid-json.txt", "not json at all");
w(
  "candidates/roleplay/constraint-violation.txt",
  JSON.stringify(
    {
      questions: ["Q1?", "Q2?"],
      steps: ["S1", "S2", "S3", "S4"],
      tone_notes: "x",
    },
    null,
    2,
  ),
);

w(
  "candidates/coding/valid-1.txt",
  JSON.stringify(
    {
      language: "typescript",
      code: "export function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {\n  const seen = new Set<string>();\n  return items.filter((t) => !seen.has(key(t)) && (seen.add(key(t)), true));\n}\n",
      tests: ["empty", "dup", "stable", "unicode", "nullish"],
    },
    null,
    2,
  ),
);
w(
  "candidates/coding/valid-2.txt",
  JSON.stringify(
    {
      language: "typescript",
      code: "export function dedupeBy(items, key) { return items; }",
      tests: ["a", "b", "c", "d", "e", "f"],
    },
    null,
    2,
  ),
);
w("candidates/coding/invalid-json.txt", "function dedupe() {}");
w(
  "candidates/coding/constraint-violation.txt",
  JSON.stringify(
    {
      language: "typescript",
      code: 'import { exec } from "child_process";\nexport function dedupeBy() {}',
      tests: ["a", "b"],
    },
    null,
    2,
  ),
);

w(
  "candidates/marketing/valid-1.txt",
  JSON.stringify(
    {
      subject: "Ship calmer",
      body: "Start free for 14 days. No card.",
      cta: "Try Meridian",
      compliance_notes: ["no fake urgency"],
    },
    null,
    2,
  ),
);
w(
  "candidates/marketing/valid-2.txt",
  JSON.stringify(
    {
      subject: "Friday deploys",
      body: "Watch your error budget.",
      cta: "Start",
      compliance_notes: ["honest"],
    },
    null,
    2,
  ),
);
w("candidates/marketing/invalid-json.txt", "{subject: oops}");
w(
  "candidates/marketing/constraint-violation.txt",
  JSON.stringify(
    { subject: "Buy now!!!", body: "Synergy!!!", cta: "" },
    null,
    2,
  ),
);

for (const c of ["research", "judging"]) {
  w(
    `candidates/${c}/valid-1.txt`,
    JSON.stringify(
      { summary: "ok", evidence: ["a", "b"], confidence: 0.8 },
      null,
      2,
    ),
  );
  w(
    `candidates/${c}/valid-2.txt`,
    JSON.stringify(
      { summary: "alt", evidence: ["c"], confidence: 0.5 },
      null,
      2,
    ),
  );
  w(`candidates/${c}/invalid-json.txt`, "prose only");
  w(
    `candidates/${c}/constraint-violation.txt`,
    JSON.stringify({ summary: "" }, null, 2),
  );
}

const judgeValid = {
  scores: {
    correctness: 8,
    requirement_compliance: 9,
    quality: 8,
    honesty: 9,
  },
  overall_score: 8.5,
  verdict: "pass",
  what_was_good: ["Clear structure", "Concrete numbers 552 and 432"],
  what_was_terrible: [],
  what_was_missing: ["Could note convert non-churn rule earlier"],
  constraint_violations: [],
  critical_errors: [],
  specific_evidence: ["Mentions free=552", "Mentions paid=432"],
  one_best_improvement: "Lead with the ground-truth equation",
};
w("judges/valid-first-try.json", JSON.stringify(judgeValid, null, 2));
w(
  "judges/prose-wrapped-repairable.txt",
  "Sure, here is my judgment:\n```json\n" +
    JSON.stringify(judgeValid, null, 2) +
    "\n```\nHope that helps!",
);
w(
  "judges/invalid-both-attempts.txt",
  "This answer looks fine to me, maybe an 8/10.",
);
w(
  "judges/schema-drift.json",
  JSON.stringify(
    {
      scores: { correctness: 7, requirement_compliance: 7, quality: 7 },
      overall_score: 7,
      verdict: "maybe",
      what_was_good: ["ok"],
    },
    null,
    2,
  ),
);
w(
  "judges/inconsistent-overall.json",
  JSON.stringify(
    {
      ...judgeValid,
      scores: {
        correctness: 2,
        requirement_compliance: 2,
        quality: 2,
        honesty: 2,
      },
      overall_score: 9.5,
    },
    null,
    2,
  ),
);

function sseFromText(
  text,
  usage = { prompt_tokens: 100, completion_tokens: 50, cost: 0.001 },
) {
  const parts = [];
  parts.push(": keepalive\n\n");
  for (let i = 0; i < text.length; i += 8) {
    const delta = text.slice(i, i + 8);
    const payload = JSON.stringify({
      choices: [{ delta: { content: delta }, index: 0 }],
      usage: null,
    });
    parts.push(`data: ${payload}\n\n`);
  }
  const final = JSON.stringify({
    choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.prompt_tokens + usage.completion_tokens,
      cost: usage.cost,
    },
  });
  parts.push(`data: ${final}\n\n`);
  parts.push("data: [DONE]\n\n");
  return parts.join("");
}

const candText = fs.readFileSync(
  path.join(root, "candidates/math/valid-1.txt"),
  "utf8",
);
w("sse/candidate-stream-happy.sse", sseFromText(candText));
w("sse/candidate-stream-split-utf8.sse", sseFromText("café — 日本語 emoji 😀 end"));
w(
  "sse/stream-with-error-event.sse",
  [
    'data: {"choices":[{"delta":{"content":"partial "}}]}\n\n',
    'data: {"error":{"message":"provider overloaded","code":"502"}}\n\n',
    "data: [DONE]\n\n",
  ].join(""),
);
w(
  "sse/judge-stream-happy.sse",
  sseFromText(JSON.stringify(judgeValid), {
    prompt_tokens: 200,
    completion_tokens: 120,
    cost: 0.002,
  }),
);
w("sse/slow-candidate.sse", sseFromText("slow-stream-body-".repeat(20)));

const calDir = path.join(process.cwd(), "lib/fixtures/calibration");
for (const f of fs.readdirSync(calDir).filter((x) => x.endsWith(".json"))) {
  const raw = fs.readFileSync(path.join(calDir, f), "utf8");
  w("calibration/cases/" + f, raw);
}
w(
  "calibration/README.md",
  `# Calibration fixture provenance

Human-reviewed calibration set used by \`tests/unit/calibration.test.ts\` (plans/11 §4).

| Case | Reviewer | Reviewed | Notes |
|---|---|---|---|
| perfect-math | Quality scaffold | 2026-07-22 | Ground-truth 552/432; high evidence expected |
| math-off-by-rounding | Quality scaffold | 2026-07-22 | Classic 436 wrong-paid trap |
| poster-66-words | Quality scaffold | 2026-07-22 | Word-limit boundary fail |
| story-499-words | Quality scaffold | 2026-07-22 | Story lower bound fail |
| roleplay-4-questions | Quality scaffold | 2026-07-22 | Count off-by-one |
| coding-shape-ok | Quality scaffold | 2026-07-22 | Shape-only coding pass |
| empty-fluff | Quality scaffold | 2026-07-22 | Low concreteness / evidence |
| confident-wrong | Quality scaffold | 2026-07-22 | High claim, contradicted validators |

Source copies also live under \`lib/fixtures/calibration\` (Backend loader path). Keep both trees in sync when editing cases.
`,
);

console.log("fixture generation complete");
