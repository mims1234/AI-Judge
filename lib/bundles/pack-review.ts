import type { Category } from "@/lib/schemas";

/** Browser-safe pack lint. Do not import node:crypto here. */
export const CUSTOM_JSON_FOOTER =
  'Respond with JSON only: { "answer": "<your full response>" }';

export type PackReviewFlag =
  | "too_short"
  | "missing_must_mention"
  | "missing_judge_criteria"
  | "answer_leak"
  | "missing_json_footer"
  | "candidate_id_leak";

export type PackReview = {
  score: number;
  flags: Array<{ category: Category; flag: PackReviewFlag }>;
  reviewed_at: number;
};

export function hasCanonicalFooter(body: string): boolean {
  return body.trimEnd().endsWith(CUSTOM_JSON_FOOTER);
}

export function applyCanonicalFooter(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return CUSTOM_JSON_FOOTER;
  if (hasCanonicalFooter(trimmed)) return trimmed;
  return `${trimmed}\n\n${CUSTOM_JSON_FOOTER}`;
}

function normalizeNeedle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function mentionAppearsInBody(body: string, mention: string): boolean {
  const needle = normalizeNeedle(mention);
  return Boolean(needle) && normalizeNeedle(body).includes(needle);
}

/** Drop judge-only phrases the candidate can already read in the task. */
export function cleanMustMention(body: string, mentions: string[]): string[] {
  return mentions
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && !mentionAppearsInBody(body, m));
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

export function reviewCustomPack(input: {
  tasks: Array<{
    category: Category;
    task_body: string;
    must_mention: string[];
    judge_criteria?: string[];
  }>;
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
    if ((task.judge_criteria ?? []).filter((c) => c.trim()).length === 0) {
      flags.push({ category: task.category, flag: "missing_judge_criteria" });
    }
    for (const mention of task.must_mention) {
      if (mentionAppearsInBody(body, mention)) {
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
    else if (f.flag === "missing_judge_criteria") score -= 2;
    else if (f.flag === "candidate_id_leak") score -= 2;
  }
  if (score < 0) score = 0;

  return { score, flags, reviewed_at: Date.now() };
}

export function publishBlockReason(quality: PackReview): string | null {
  if (quality.flags.some((f) => f.flag === "answer_leak")) {
    return "Cannot publish: a must-mention phrase appears in the task body (answer leak).";
  }
  if (quality.flags.some((f) => f.flag === "missing_judge_criteria")) {
    return "Cannot publish: every slot needs judge criteria.";
  }
  if (quality.score < 6) {
    return `Cannot publish: review score ${quality.score.toFixed(1)} / 10 is below 6.`;
  }
  return null;
}
