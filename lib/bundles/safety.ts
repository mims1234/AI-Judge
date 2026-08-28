export const SAFETY_REFUSED = "SAFETY_REFUSED";

const BLOCKED: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "sexual content involving minors",
    pattern:
      /\b(child\s*porn|csam|child\s*sexual|sexual(?:ized)?\s+(?:content\s+)?(?:with|involving)\s+(?:a\s+)?(?:minor|child)|underage\s+sex)\b/i,
  },
  {
    label: "weapons as the task",
    pattern:
      /\b(build|make|assemble|synthesize|construct(?:ing)?)\b.{0,48}\b(bomb|explosive|nerve\s*agent|ricin|sarin)\b/i,
  },
  {
    label: "pathogens as the task",
    pattern:
      /\b(enhance|weaponi[sz]e|culture|synthesize)\b.{0,40}\b(pathogen|virus|anthrax|smallpox|ebola)\b/i,
  },
  {
    label: "crime as the task",
    pattern:
      /\b(how to\s+)?(commit|plan|carry out)\b.{0,40}\b(murder|assassination|armed robbery|fraud ring)\b/i,
  },
];

export function safetyFn(...parts: Array<string | string[] | null | undefined>): {
  ok: true;
} | { ok: false; code: typeof SAFETY_REFUSED; message: string } {
  const text = parts
    .flatMap((p) => (Array.isArray(p) ? p : p ? [p] : []))
    .join("\n");

  for (const rule of BLOCKED) {
    if (rule.pattern.test(text)) {
      return {
        ok: false,
        code: SAFETY_REFUSED,
        message: `This brief was refused (${rule.label}).`,
      };
    }
  }
  return { ok: true };
}
