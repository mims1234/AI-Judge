/**
 * Blind-judging helpers: find or mask candidate model names in text that
 * judges will read. Matching is case-insensitive and never fires inside a
 * longer alphanumeric token, so a short id like "o3" does not match "foo3".
 */

export const MODEL_NAME_MASK = "[model]";

export const MODEL_NAMES_MASKED_NOTE =
  "[PLATFORM NOTE: The harness replaced model names in the answer with [model] to keep judging blind. Do NOT penalize the answer for that placeholder.]";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strings that identify a model: the full OpenRouter id, the part after the
 * provider prefix, and that part without a `:variant` tag. Longest first so
 * the full id wins over its own suffix.
 */
export function modelNameNeedles(modelIds: readonly string[]): string[] {
  const needles = new Set<string>();
  for (const raw of modelIds) {
    const id = raw.trim();
    if (!id) continue;
    needles.add(id);
    const suffix = id.includes("/") ? id.split("/").slice(1).join("/") : "";
    if (suffix) {
      needles.add(suffix);
      const base = suffix.split(":")[0];
      if (base) needles.add(base);
    }
  }
  return [...needles].sort((a, b) => b.length - a.length);
}

function needlePattern(needles: string[], flags: string): RegExp | null {
  if (needles.length === 0) return null;
  const body = needles.map(escapeRegExp).join("|");
  return new RegExp(`(?<![A-Za-z0-9])(?:${body})(?![A-Za-z0-9])`, flags);
}

/** First model name found in `text`, or null. */
export function findModelMention(
  text: string,
  modelIds: readonly string[],
): string | null {
  const pattern = needlePattern(modelNameNeedles(modelIds), "i");
  if (!pattern) return null;
  const match = pattern.exec(text);
  return match ? match[0] : null;
}

/** Replace every model name in `text` with the mask. */
export function maskModelMentions(
  text: string,
  modelIds: readonly string[],
): { text: string; masked: number } {
  const pattern = needlePattern(modelNameNeedles(modelIds), "gi");
  if (!pattern) return { text, masked: 0 };
  let masked = 0;
  const out = text.replace(pattern, () => {
    masked += 1;
    return MODEL_NAME_MASK;
  });
  return { text: out, masked };
}
