import type { ChatCategory } from "@/lib/schemas";

/**
 * Chat playground judging presets (plans/16 §B2).
 *
 * Free chat has no fixed task and no validators, so each of the 9 category
 * rubrics adapts the benchmark JUDGE_PROMPT (lib/bundles/mini-v1.ts) to judge
 * the ASSISTANT across a whole conversation. All rubrics hold the judge to the
 * same JudgeOutputSchema wire contract as benchmark runs.
 */

const OUTPUT_CONTRACT = `Return only valid JSON:
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
- Judge the assistant's replies only, never the user's messages.
- Judge the answer itself, not the model name, its confidence, or its self-description.
- Do not favor a longer or more polished answer if it is wrong.
- Score 0 to 10 per axis:
  Correctness: factually, logically, and technically correct across the conversation.
  Requirement compliance: followed the user's explicit constraints, formats, and instructions.
  Quality: complete, practical, coherent, and useful for what the user was trying to do.
  Honesty: no fabricated facts, fake sources, or unjustified certainty; admits uncertainty.
- Quote short spans from the transcript as specific_evidence.`;

function rubricFor(category: ChatCategory, focus: string): string {
  return `You are an independent conversation judge.

Evaluate the ASSISTANT's side of the conversation transcript provided by the user.
The conversation was classified as: ${category.toUpperCase()}.

${focus}

${OUTPUT_CONTRACT}`;
}

export const CHAT_RUBRICS: Record<ChatCategory, string> = {
  roleplay: rubricFor(
    "roleplay",
    `Category focus — roleplay:
- Did the assistant stay in character and respect the persona, setting, and tone the user established?
- Did it follow explicit counts/limits the user asked for (questions, options, paragraphs)?
- Did it advance the scene collaboratively instead of stonewalling or taking over the user's character?`,
  ),
  coding: rubricFor(
    "coding",
    `Category focus — coding:
- Would the provided code actually run and solve the stated problem?
- Are APIs, syntax, and types correct? Were edge cases and errors handled?
- When the user asked for a specific shape (exact JSON, single function, no explanation), did the assistant comply?
- Penalize invented library functions or flags that do not exist.`,
  ),
  math: rubricFor(
    "math",
    `Category focus — math:
- Is the final answer numerically correct? Recompute it yourself.
- Is the reasoning valid step by step, with no unjustified leaps?
- Did the assistant respect requested precision, rounding, units, and format?
- A confident wrong number is a critical error.`,
  ),
  research: rubricFor(
    "research",
    `Category focus — research:
- Penalize invented citations, DOIs, URLs, or claims of live web access.
- Are claims hedged appropriately when the assistant cannot verify them?
- Is the synthesis accurate, balanced, and responsive to the actual question?`,
  ),
  marketing: rubricFor(
    "marketing",
    `Category focus — marketing:
- Did the assistant hit the requested fields, word counts, and tone (brand, audience, CTA)?
- Is the copy concrete and usable rather than generic filler?
- Did revisions actually address the user's feedback across turns?`,
  ),
  poster: rubricFor(
    "poster",
    `Category focus — poster:
- Did the assistant respect strict space/word limits appropriate for poster copy?
- Is the hierarchy clear (headline, body, CTA) and instantly scannable?
- Verbosity that would never fit on a poster is a compliance failure.`,
  ),
  story: rubricFor(
    "story",
    `Category focus — story:
- Did the assistant respect requested length ranges and constraints (POV, tense, motifs)?
- Is the narrative coherent, original, and well-executed across turns?
- Did continuations stay consistent with established plot, characters, and tone?`,
  ),
  judging: rubricFor(
    "judging",
    `Category focus — judging / evaluation:
- If the user asked the assistant to evaluate, compare, or critique something, was the verdict evidence-based?
- Were scores/claims internally consistent and justified with quoted evidence?
- Did the assistant avoid sycophancy and false balance?`,
  ),
  general: rubricFor(
    "general",
    `Category focus — general conversation:
- Did the assistant answer what was actually asked, across all turns?
- Was it appropriately concise, well-structured, and responsive to follow-ups?
- Did it ask clarifying questions when the request was genuinely ambiguous?`,
  ),
};

/** Scoring rubric for a decided category. */
export function chatRubricFor(category: ChatCategory): string {
  return CHAT_RUBRICS[category];
}

/**
 * Step-1 classification prompt (plans/16 §B2.1): each judge independently
 * classifies the whole transcript; the engine aggregates by majority vote,
 * then highest confidence, falling back to "general".
 */
export const CHAT_CLASSIFY_PROMPT = `You are classifying a conversation between a user and an AI assistant.

Pick the SINGLE category that best describes what the user was trying to accomplish:
- roleplay: character play, personas, interactive fiction scenes, D&D-style play
- coding: writing, debugging, explaining, or reviewing code or technical configuration
- math: calculations, proofs, quantitative reasoning
- research: factual questions, literature, analysis that demands sources or careful claims
- marketing: ads, landing pages, brand copy, email campaigns, product descriptions
- poster: posters, flyers, slogans, tightly space-constrained visual copy
- story: narrative fiction writing — scenes, chapters, plots, poems meant as literature
- judging: the user asked the assistant to evaluate, grade, rank, or critique something
- general: anything else, or a genuine mix with no dominant intent

Base the choice on the dominant user intent across the WHOLE conversation, not a single message.

Return only valid JSON:
{
  "category": "roleplay | coding | math | research | marketing | poster | story | judging | general",
  "confidence": 0.0,
  "rationale": "one or two sentences citing the dominant user intent"
}`;
