import { createHash } from "node:crypto";
import type { Category } from "@/lib/schemas";
import { CATEGORY_ORDER } from "@/lib/schemas";
import { JUDGE_OUTPUT_SCHEMA, JUDGE_PROMPT, WRAPPER } from "@/lib/bundles/mini-v1";
import { applyCanonicalFooter } from "@/lib/bundles/pack-review";

export {
  applyCanonicalFooter,
  containsModelIds,
  CUSTOM_JSON_FOOTER,
  hasCanonicalFooter,
  reviewCustomPack,
  type PackReview,
  type PackReviewFlag,
} from "@/lib/bundles/pack-review";

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
