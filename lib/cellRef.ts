import { CATEGORY_ORDER, type Category } from "@/lib/schemas";

/**
 * Cell reference helpers (plans/15 §A1).
 * A cell is addressed by run + category (path) + candidate (query) + trial (query).
 * Candidate stays out of the path because OpenRouter ids contain "/" and ":"
 * (e.g. cohere/foo:free).
 */

export type CellRef = {
  candidate: string | null;
  category: Category | null;
  trial: number | null;
};

const EMPTY_REF: CellRef = { candidate: null, category: null, trial: null };

export function isCategory(raw: string): raw is Category {
  return (CATEGORY_ORDER as string[]).includes(raw);
}

/**
 * Parse legacy `?cell=` values — OpenRouter ids may contain ":" (e.g.
 * cohere/foo:free), so category/trial are taken from the right, not by a
 * naive split.
 * Formats: `<candidate>:<category>` | `<candidate>:<category>:<trialIndex>`
 */
export function parseCellParam(raw: string | null): CellRef {
  if (!raw) return EMPTY_REF;
  const parts = raw.split(":");
  if (parts.length < 2) return EMPTY_REF;

  // `<candidate>:<category>:<trial>` — trial is a non-negative integer suffix
  if (parts.length >= 3) {
    const trialRaw = parts[parts.length - 1]!;
    const categoryRaw = parts[parts.length - 2]!;
    if (/^\d+$/.test(trialRaw) && isCategory(categoryRaw)) {
      const candidate = parts.slice(0, -2).join(":");
      if (!candidate) return EMPTY_REF;
      return { candidate, category: categoryRaw, trial: Number(trialRaw) };
    }
  }

  // `<candidate>:<category>` — category is a known enum at the end
  const categoryRaw = parts[parts.length - 1]!;
  if (!isCategory(categoryRaw)) return EMPTY_REF;
  const candidate = parts.slice(0, -1).join(":");
  if (!candidate) return EMPTY_REF;
  return { candidate, category: categoryRaw, trial: null };
}

/** Parse the `?trial=` query value — non-negative integer or null. */
export function parseTrialParam(raw: string | null): number | null {
  if (raw == null || raw === "" || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/** Canonical cell page URL. */
export function buildCellHref(
  runId: string,
  candidate: string,
  category: Category,
  trial?: number | null,
): string {
  const q = new URLSearchParams({ candidate });
  if (trial != null) q.set("trial", String(trial));
  return `/runs/${encodeURIComponent(runId)}/cell/${category}?${q.toString()}`;
}
