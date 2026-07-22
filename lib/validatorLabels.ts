import type { Category } from "@/lib/schemas";

/**
 * Plain-language validator labels (display only — the checks themselves are
 * deterministic server-side, plans/06). Used by /bundles task cards and as
 * friendly names in the arena ValidatorPanel.
 */

export const VALIDATOR_LABELS: Record<string, string> = {
  json_parseable: "Output parses as JSON",
  no_extra_prose: "No prose outside the JSON object",
  required_keys: "All required keys present",
  key_types: "Values have the expected types",
  array_counts: "Arrays have the exact required counts",
  poster_word_limit: "Word count within the 65-word limit",
  story_word_range: "Between 500 and 700 words (inclusive)",
  roleplay_counts: "Exactly 3 strengths + 5 incident steps",
  marketing_fields: "All required fields present and non-empty",
  coding_function_present: "Requested function is defined",
  coding_test_count: "Required number of tests included",
  coding_no_forbidden_imports: "No forbidden imports",
  math_free_count: "Free-plan count present as an integer",
  math_paid_count: "Paid-plan count present as an integer",
  math_ground_truth: "Exact answers — free = 552, paid = 432",
};

export function validatorLabel(name: string): string {
  return VALIDATOR_LABELS[name] ?? name.replaceAll("_", " ");
}

export const UNIVERSAL_VALIDATORS = [
  "json_parseable",
  "no_extra_prose",
  "required_keys",
  "key_types",
  "array_counts",
] as const;

const CATEGORY_VALIDATORS: Record<Category, string[]> = {
  roleplay: ["roleplay_counts"],
  coding: ["coding_function_present", "coding_test_count", "coding_no_forbidden_imports"],
  math: ["math_free_count", "math_paid_count", "math_ground_truth"],
  research: [],
  marketing: ["marketing_fields"],
  poster: ["poster_word_limit"],
  story: ["story_word_range"],
  judging: [],
};

/** Ordered validator names run for a category (universal chain + specific). */
export function validatorsForCategory(category: Category): string[] {
  return [...UNIVERSAL_VALIDATORS, ...CATEGORY_VALIDATORS[category]];
}

/** Short chip labels for collapsed task cards. */
export const CATEGORY_SUMMARIES: Record<Category, string> = {
  roleplay: "Calm senior DevOps engineer guiding a junior through a 502 incident",
  coding: "Implement a typed createIdempotencyGuard with tests",
  math: "Exact free/paid user counts after one month of churn",
  research: "PostgreSQL vs MongoDB for a bootstrapped SaaS — no invented sources",
  marketing: "Launch message for RelayGuard, a Discord scam-detection SaaS",
  poster: "Announcement poster text for a Midnight Code Jam, ≤ 65 words",
  story: "Sci-fi short: a moderation bot quietly preventing multiverse disasters",
  judging: "Score two answers about storing encrypted passwords",
};
