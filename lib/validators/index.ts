import type { Category } from "@/lib/schemas";
import {
  runUniversalValidators,
  validateCodingShape,
  validateMarketingFields,
  validatePosterWordLimit,
  validateRoleplayCounts,
  validateStoryWordRange,
  type TaskSnapshot,
  type ValidatorFinding,
} from "@/lib/validators/common";
import { validateMathGroundTruth } from "@/lib/validators/math";

export type { TaskSnapshot, ValidatorFinding } from "@/lib/validators/common";
export { computeMathGroundTruth } from "@/lib/validators/math";
export {
  countWords,
  extractJson,
  hydrateValidatorFinding,
  isCountableFinding,
  isInformationalFinding,
  isSkippedFinding,
  CREATIVE_CATEGORIES,
} from "@/lib/validators/common";

export function runValidators(
  category: Category | string,
  rawOutput: string,
  task: TaskSnapshot,
): ValidatorFinding[] {
  const { findings, parsed } = runUniversalValidators(rawOutput, task);

  switch (category) {
    case "poster":
      findings.push(validatePosterWordLimit(parsed));
      break;
    case "story":
      findings.push(validateStoryWordRange(parsed));
      break;
    case "roleplay":
      findings.push(validateRoleplayCounts(parsed));
      break;
    case "marketing":
      findings.push(validateMarketingFields(parsed, task));
      break;
    case "math":
      findings.push(...validateMathGroundTruth(parsed));
      break;
    case "coding":
      findings.push(...validateCodingShape(parsed));
      break;
    case "research":
    case "judging":
      break;
    default:
      break;
  }

  return findings;
}
