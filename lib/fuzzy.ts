/**
 * Dependency-free fuzzy matcher for the ModelPicker (plans/08 §2.2).
 * Subsequence match, case-insensitive, scored by consecutive-run length +
 * start-of-word bonuses. Pre-lowercase haystacks once (caller side) to stay
 * under 5ms for 450 models.
 */

export type FuzzyMatch = {
  score: number;
  indices: number[]; // matched character positions in the target
};

function isWordBoundary(target: string, index: number): boolean {
  if (index === 0) return true;
  const prev = target.charAt(index - 1);
  if (prev === "-" || prev === "/" || prev === "_" || prev === " " || prev === "." || prev === ":") {
    return true;
  }
  // camelCase transition
  const cur = target.charAt(index);
  return prev >= "a" && prev <= "z" && cur >= "A" && cur <= "Z";
}

/**
 * Match `query` (already lowercased) against `targetLower` / `targetRaw`.
 * Returns null when the query is not a subsequence.
 */
export function fuzzyMatch(
  query: string,
  targetRaw: string,
  targetLower?: string,
): FuzzyMatch | null {
  if (query.length === 0) return { score: 0, indices: [] };
  const target = targetLower ?? targetRaw.toLowerCase();
  if (query.length > target.length) return null;

  const indices: number[] = [];
  let score = 0;
  let cursor = 0;
  let lastHit = -2;

  for (let qi = 0; qi < query.length; qi++) {
    const qc = query.charAt(qi);
    const hit = target.indexOf(qc, cursor);
    if (hit === -1) return null;
    score += 1;
    if (hit === lastHit + 1) score += 3; // consecutive run
    if (isWordBoundary(targetRaw, hit)) score += 4; // word start
    if (qi === 0 && hit === 0) score += 2; // target prefix
    indices.push(hit);
    cursor = hit + 1;
    lastHit = hit;
  }

  // Prefer tighter spreads (earlier last hit relative to length)
  score -= (indices[indices.length - 1]! - indices[0]!) * 0.05;

  return { score, indices };
}

export type FuzzyScored<T> = {
  item: T;
  score: number;
  indices: number[]; // indices into the winning key string
  keyIndex: number; // which key won
};

/**
 * Filter + rank items by the best match across their lowercase keys.
 * `keysOf` must return lowercase strings paired with their raw originals.
 */
export function fuzzyFilter<T>(
  items: T[],
  queryRaw: string,
  keysOf: (item: T) => Array<{ raw: string; lower: string }>,
): FuzzyScored<T>[] {
  const query = queryRaw.trim().toLowerCase();
  if (query.length === 0) {
    return items.map((item) => ({ item, score: 0, indices: [], keyIndex: 0 }));
  }

  const out: FuzzyScored<T>[] = [];
  for (const item of items) {
    const keys = keysOf(item);
    let best: FuzzyScored<T> | null = null;
    for (let ki = 0; ki < keys.length; ki++) {
      const key = keys[ki]!;
      const m = fuzzyMatch(query, key.raw, key.lower);
      if (m && (!best || m.score > best.score)) {
        best = { item, score: m.score, indices: m.indices, keyIndex: ki };
      }
    }
    if (best) out.push(best);
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Split a string into highlighted/unhighlighted segments for rendering. */
export function highlightSegments(
  raw: string,
  indices: number[],
): Array<{ text: string; match: boolean }> {
  if (indices.length === 0) return [{ text: raw, match: false }];
  const set = new Set(indices);
  const segments: Array<{ text: string; match: boolean }> = [];
  let current = { text: "", match: set.has(0) };
  for (let i = 0; i < raw.length; i++) {
    const isMatch = set.has(i);
    if (isMatch !== current.match) {
      if (current.text) segments.push(current);
      current = { text: "", match: isMatch };
    }
    current.text += raw.charAt(i);
  }
  if (current.text) segments.push(current);
  return segments;
}
