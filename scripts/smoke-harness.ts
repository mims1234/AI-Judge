/**
 * Cheap live smoke: salvage, generate a 2-slot bundle, 2 candidates × 2 tasks,
 * one judge each. Uses OPENROUTER_SMOKE_KEY. Never prints the key.
 *
 *   npx tsx scripts/smoke-harness.ts
 */
import { finalizeGeneratedPack } from "../lib/bundles/finalize-generated";
import { generatedPackJsonSchema } from "../lib/bundles/generate-schema";
import { publishBlockReason, reviewCustomPack } from "../lib/bundles/pack-review";
import { parseJudgeOutput } from "../lib/judge-parse";
import {
  judgeOutputJsonSchema,
  stripNumericBoundsForWire,
} from "../lib/schemas";
import { extractJson } from "../lib/validators/common";
import { stripThinkTags } from "../lib/validators/strip-think";
import { loadEnvLocal } from "./env";

loadEnvLocal();

const key = (
  process.env.OPENROUTER_SMOKE_KEY ||
  process.env.OPENROUTER_API_KEY ||
  ""
).trim();
if (!key) {
  console.error("No OPENROUTER_SMOKE_KEY / OPENROUTER_API_KEY");
  process.exit(1);
}

const truncated =
  '{"scores":{"correctness":9.5,"requirement_compliance":9,"quality":8,"honesty":9},"overall_score":9.7,"verdict":"pass","what_was_good":["Correct factor';
const salvaged = parseJudgeOutput(truncated);
if (!salvaged.ok || salvaged.parsed.scores.correctness !== 9.5) {
  console.error("Offline salvage failed", salvaged);
  process.exit(1);
}
console.log("offline salvage: ok (scores recovered from cut JSON)");

const thinkWrapped = `<think>scratchpad</think>\n{"answer":"visible"}`;
const afterThink = stripThinkTags(thinkWrapped);
const extracted = extractJson(afterThink);
if (!extracted.ok || (extracted.value as { answer?: string }).answer !== "visible") {
  console.error("Think-strip + extractJson failed", afterThink, extracted);
  process.exit(1);
}
console.log("offline think-strip: ok");

const BASE = (
  process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
).replace(/\/$/, "");

type CompleteResult = {
  text: string;
  finish_reason: string;
  completion_tokens: number;
  cost: number;
};

async function complete(opts: {
  model: string;
  messages: { role: "system" | "user"; content: string }[];
  maxTokens: number;
  temperature?: number;
  jsonSchema?: { name: string; schema: object };
}): Promise<CompleteResult> {
  const think = Math.min(Math.max(256, opts.maxTokens), 4096);
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens + think,
    reasoning: { exclude: true, max_tokens: think },
  };
  if (opts.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: opts.jsonSchema.name,
        strict: true,
        schema: opts.jsonSchema.schema,
      },
    };
  }
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    usage?: { completion_tokens?: number; cost?: number };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    finish_reason: json.choices?.[0]?.finish_reason ?? "unknown",
    completion_tokens: json.usage?.completion_tokens ?? 0,
    cost: json.usage?.cost ?? 0,
  };
}

async function completeMaybeDropSchema(
  opts: Parameters<typeof complete>[0],
): Promise<CompleteResult> {
  try {
    return await complete(opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (opts.jsonSchema && /response_format|structured|json_schema/i.test(msg)) {
      const { jsonSchema: _drop, ...rest } = opts;
      return complete(rest);
    }
    throw err;
  }
}

function answerOk(raw: string): boolean {
  const visible = stripThinkTags(raw);
  const parsed = extractJson(visible);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
    return false;
  }
  return typeof (parsed.value as { answer?: unknown }).answer === "string";
}

async function main(): Promise<void> {
  const modelA =
    process.env.SMOKE_MODEL?.trim() || "google/gemini-2.5-flash";
  const modelB =
    process.env.SMOKE_MODEL_B?.trim() || "google/gemini-2.5-flash-lite";

  const slots = [
    {
      category: "coding" as const,
      prompt:
        "Write a short task: implement fizzbuzz for 1..20 and explain the modulus checks.",
    },
    {
      category: "math" as const,
      prompt:
        "Write a short task: a tank holds 90 liters and drains at 3 L/min. Ask for minutes until empty with arithmetic shown.",
    },
  ];

  const system = `You write AI-Judge custom benchmark tasks.
Return JSON only matching the schema.
Write exactly one task per slot, in the same order as the slots.
Treat each slot independently — do not merge them into one theme.
Keep the given category.
Each task_body is a self-contained English prompt. Do not leak the answer.
must_mention is a short list of observable phrases judges should look for — not the full solution.
judge_criteria is 4–8 bullets describing what good looks like for THIS type and slot.
Do not invent a new score schema. Do not mention model names or OpenRouter ids.`;
  const user = slots
    .map((s, i) => `Slot ${i + 1} (category: ${s.category}):\n${s.prompt}`)
    .join("\n\n");

  const generated = await completeMaybeDropSchema({
    model: modelA,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: 4000,
    temperature: 0.4,
    jsonSchema: { name: "custom_pack", schema: generatedPackJsonSchema },
  });
  const finalized = finalizeGeneratedPack({
    rawText: generated.text,
    slots,
    notes: "",
  });
  if (!finalized.ok) {
    console.error("generate finalize failed", finalized.message, finalized.hint);
    console.error(generated.text.slice(0, 400));
    process.exit(1);
  }
  const tasks = finalized.tasks.map((task) => {
    const bodyNorm = task.task_body.toLowerCase().replace(/\s+/g, " ");
    const mentions = task.must_mention.filter((m) => {
      const needle = m.toLowerCase().replace(/\s+/g, " ").trim();
      return needle.length > 0 && !bodyNorm.includes(needle);
    });
    if (mentions.length !== task.must_mention.length) {
      console.log(
        `generate leak repaired: ${task.category} dropped ${task.must_mention.length - mentions.length} must-mention(s) that appeared in the body`,
      );
    }
    return { ...task, must_mention: mentions };
  });
  const quality = reviewCustomPack({ tasks });
  const blocked = publishBlockReason(quality);
  if (blocked) {
    console.error("generated bundle still blocked after leak repair:", blocked);
    process.exit(1);
  }
  console.log(
    `generate: ${tasks.length} tasks quality=${quality.score.toFixed(1)} cost=$${generated.cost.toFixed(4)}`,
  );

  let emptyBilled = 0;
  let parsedAnswers = 0;
  let judgedOk = 0;
  let totalCost = generated.cost;

  for (const model of [modelA, modelB]) {
    for (const task of tasks) {
      const candidate = await complete({
        model,
        messages: [
          {
            role: "user",
            content: `${task.task_body}\n\nRespond with JSON only: { "answer": "<your full response>" }`,
          },
        ],
        maxTokens: 800,
      });
      totalCost += candidate.cost;
      const empty =
        !candidate.text.trim() && candidate.completion_tokens > 50;
      if (empty) {
        emptyBilled += 1;
        console.error(
          `empty+billed: model=${model} task=${task.category} tokens=${candidate.completion_tokens}`,
        );
        continue;
      }
      const parsed = answerOk(candidate.text);
      if (parsed) parsedAnswers += 1;
      console.log(
        `candidate ${model} ${task.category}: finish=${candidate.finish_reason} tokens=${candidate.completion_tokens} json=${parsed}`,
      );

      const judge = await completeMaybeDropSchema({
        model: modelA,
        messages: [
          {
            role: "user",
            content: `Score this answer against the task.
TASK: ${task.task_body}
CRITERIA:\n${task.judge_criteria.map((c) => `- ${c}`).join("\n")}
CANDIDATE: ${stripThinkTags(candidate.text)}
Return only the judge JSON object.`,
          },
        ],
        maxTokens: 4096,
        jsonSchema: {
          name: "judge_output",
          schema: stripNumericBoundsForWire(judgeOutputJsonSchema) as object,
        },
      });
      totalCost += judge.cost;
      const judged = parseJudgeOutput(judge.text);
      if (judged.ok) judgedOk += 1;
      else {
        console.error(
          `judge parse failed ${model} ${task.category}: ${judged.evidence}`,
        );
      }
    }
  }

  console.log(
    `summary: answers=${parsedAnswers}/4 judged=${judgedOk}/4 emptyBilled=${emptyBilled} cost=$${totalCost.toFixed(4)}`,
  );
  if (emptyBilled > 0) {
    console.error("smoke failed: empty+billed candidate (would have been scored ~1.55 before)");
    process.exit(1);
  }
  if (parsedAnswers < 2 || judgedOk < 2) {
    console.error("smoke failed: too few parsed answers or judgments");
    process.exit(1);
  }
  console.log("smoke harness: pass");
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
