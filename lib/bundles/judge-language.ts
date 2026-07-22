/**
 * All AI Judge judging (bundle runs + chat playground) must produce English
 * free-text. Candidate/user content may be in any language and may be quoted.
 */
export const JUDGE_ENGLISH_ONLY_RULE =
  "Language requirement: Respond in English only. All free-text judgment fields (rationale, what_was_good, what_was_terrible, what_was_missing, constraint_violations, critical_errors, specific_evidence, one_best_improvement, and any other commentary) must be written in English. You may quote non-English source text as evidence, but your own analysis must be English.";

const MARKER = "Respond in English only";

/** Append the English-only rule unless the prompt already includes it. */
export function withJudgeEnglishOnly(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.includes(MARKER)) return trimmed;
  return `${trimmed}\n\n${JUDGE_ENGLISH_ONLY_RULE}`;
}
