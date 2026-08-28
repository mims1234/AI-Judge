import { createHash } from "node:crypto";
import type { Category } from "@/lib/schemas";
import { CATEGORY_ORDER } from "@/lib/schemas";
import { JUDGE_OUTPUT_SCHEMA, JUDGE_PROMPT, WRAPPER } from "@/lib/bundles/mini-v1";

export const CUSTOM_JSON_FOOTER =
  'Respond with JSON only: { "answer": "<your full response>" }';

export const CUSTOM_ANSWER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};

export const CUSTOM_TOKEN_LIMITS: Record<Category, number> = {
  roleplay: 1200,
  coding: 3000,
  math: 1200,
  research: 2500,
  marketing: 1500,
  poster: 800,
  story: 2500,
  judging: 2000,
  general: 2000,
  other: 2000,
};

export const CUSTOM_WRAPPER = WRAPPER;
export const CUSTOM_JUDGE_PROMPT = JUDGE_PROMPT;

export const THEME_MAX = 2_000;
export const NOTES_MAX = 8_000;
export const TASK_BODY_MAX = 8_000;
export const MUST_MENTION_MAX = 12;
export const MUST_MENTION_ITEM_MAX = 240;

export type ValidatorProfile = "official" | "custom_answer_v1";

export type PackReviewFlag =
  | "too_short"
  | "missing_must_mention"
  | "answer_leak"
  | "missing_json_footer"
  | "candidate_id_leak";

export type PackReview = {
  score: number;
  flags: Array<{ category: Category; flag: PackReviewFlag }>;
  reviewed_at: number;
};

export type CustomHashTask = {
  category: Category;
  task_body: string;
  judge_prompt: string;
  output_schema: Record<string, unknown>;
  token_limit: number;
  weight: number;
  must_mention: string[];
};

function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
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

export function hasCanonicalFooter(body: string): boolean {
  return body.trimEnd().endsWith(CUSTOM_JSON_FOOTER);
}

export function applyCanonicalFooter(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return CUSTOM_JSON_FOOTER;
  if (hasCanonicalFooter(trimmed)) return trimmed;
  return `${trimmed}\n\n${CUSTOM_JSON_FOOTER}`;
}

export function computeCustomContentHash(input: {
  name: string;
  version: string;
  wrapper: string;
  tasks: CustomHashTask[];
}): string {
  const tasks = [...input.tasks]
    .sort((a, b) => {
      const byCat = a.category.localeCompare(b.category);
      if (byCat !== 0) return byCat;
      return applyCanonicalFooter(a.task_body).localeCompare(
        applyCanonicalFooter(b.task_body),
      );
    })
    .map((t) => ({
      category: t.category,
      task_body: applyCanonicalFooter(t.task_body),
      judge_prompt: t.judge_prompt,
      output_schema: t.output_schema,
      token_limit: t.token_limit,
      weight: t.weight,
      must_mention: t.must_mention,
    }));

  const payload = {
    name: input.name,
    version: input.version,
    wrapper: input.wrapper,
    tasks,
    judge_output_schema: JUDGE_OUTPUT_SCHEMA,
  };

  return createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}

function normalizeNeedle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function reviewCustomPack(input: {
  tasks: Array<{ category: Category; task_body: string; must_mention: string[] }>;
  candidateIds?: string[];
}): PackReview {
  const flags: PackReview["flags"] = [];

  for (const task of input.tasks) {
    const body = task.task_body.trim();
    if (body.length < 80) {
      flags.push({ category: task.category, flag: "too_short" });
    }
    if (task.must_mention.length === 0) {
      flags.push({ category: task.category, flag: "missing_must_mention" });
    }
    const bodyNorm = normalizeNeedle(body);
    for (const mention of task.must_mention) {
      const needle = normalizeNeedle(mention);
      if (needle && bodyNorm.includes(needle)) {
        flags.push({ category: task.category, flag: "answer_leak" });
        break;
      }
    }
    if (!hasCanonicalFooter(task.task_body)) {
      flags.push({ category: task.category, flag: "missing_json_footer" });
    }
    if (input.candidateIds?.length) {
      const blob = `${task.task_body}\n${task.must_mention.join("\n")}`;
      if (containsModelIds(blob, input.candidateIds)) {
        flags.push({ category: task.category, flag: "candidate_id_leak" });
      }
    }
  }

  let score = 10;
  for (const f of flags) {
    if (f.flag === "too_short") score -= 2;
    else if (f.flag === "answer_leak") score -= 3;
    else if (f.flag === "missing_must_mention") score -= 1;
    else if (f.flag === "candidate_id_leak") score -= 2;
  }
  if (score < 0) score = 0;

  return { score, flags, reviewed_at: Date.now() };
}

export function containsModelIds(text: string, ids: string[]): boolean {
  for (const id of ids) {
    if (!id) continue;
    if (text.includes(id)) return true;
    const suffix = id.includes("/") ? id.split("/").slice(1).join("/") : id;
    if (suffix && text.includes(suffix)) return true;
  }
  return false;
}

export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "custom-pack";
}

export function uniqueSlug(base: string, exists: (slug: string) => boolean): string {
  if (!exists(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export function sortCategories(cats: Category[]): Category[] {
  return CATEGORY_ORDER.filter((c) => cats.includes(c));
}
