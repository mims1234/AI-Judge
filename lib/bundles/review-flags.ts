import type { PackReview, PackReviewFlag } from "@/lib/bundles/pack-review";

export const PACK_FLAG_LABEL: Record<PackReviewFlag, string> = {
  too_short: "Too short",
  missing_must_mention: "Missing must-mention",
  answer_leak: "Answer leak",
  missing_json_footer: "Missing JSON footer",
  candidate_id_leak: "Candidate id leak",
};

export const PACK_FLAG_HINT: Record<PackReviewFlag, string> = {
  too_short: "Task body is under 80 characters.",
  missing_must_mention:
    "Add judge-only phrases the answer should include. Candidates never see these.",
  answer_leak:
    "A must-mention phrase already appears in the task body — the candidate can read the hint.",
  missing_json_footer:
    "The canonical JSON footer is missing. Informational — the server usually appends it.",
  candidate_id_leak: "A model id leaked into the prompt or must-mention list.",
};

export const PACK_FLAG_PENALTY: Record<PackReviewFlag, number> = {
  too_short: 2,
  missing_must_mention: 1,
  answer_leak: 3,
  missing_json_footer: 0,
  candidate_id_leak: 2,
};

export function packReviewSummary(quality: PackReview): string {
  if (quality.flags.length === 0) {
    return "Starts at 10. No mechanical flags.";
  }
  const parts = quality.flags
    .map((f) => {
      const n = PACK_FLAG_PENALTY[f.flag];
      return n > 0
        ? `${PACK_FLAG_LABEL[f.flag]} −${n}`
        : `${PACK_FLAG_LABEL[f.flag]} (no score change)`;
    })
    .join(", ");
  return `Starts at 10. ${parts}. Score ${quality.score.toFixed(1)} / 10.`;
}
