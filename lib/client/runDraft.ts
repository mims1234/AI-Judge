import { CATEGORY_ORDER, type Category } from "@/lib/schemas";

/**
 * Wizard draft persistence (plans/09 §1.1) — sessionStorage key `ai-judge:run-draft`.
 * Survives refresh; cleared on successful launch.
 */

export const RUN_DRAFT_KEY = "ai-judge:run-draft";

export type RunDraft = {
  bundleId: string | null;
  categories: Category[];
  candidateIds: string[];
  judgePoolIds: string[];
  trials: number;
  candidateConcurrency: number;
  budgetUsd: number;
  /** Generated when Review mounts — double-submit guard for POST /api/runs. */
  idempotencyKey: string | null;
};

export function defaultRunDraft(partial?: Partial<RunDraft>): RunDraft {
  return {
    bundleId: null,
    categories: [...CATEGORY_ORDER],
    candidateIds: [],
    judgePoolIds: [],
    trials: 1,
    candidateConcurrency: 1,
    budgetUsd: 2,
    idempotencyKey: null,
    ...partial,
  };
}

export function loadRunDraft(): RunDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RUN_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunDraft>;
    return defaultRunDraft(parsed);
  } catch {
    return null;
  }
}

export function saveRunDraft(draft: RunDraft): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(RUN_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // quota / private mode — non-fatal
  }
}

export function clearRunDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(RUN_DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Overlap between candidates and judge pool (self-judging warning). */
export function overlapIds(draft: Pick<RunDraft, "candidateIds" | "judgePoolIds">): string[] {
  const judges = new Set(draft.judgePoolIds);
  return draft.candidateIds.filter((id) => judges.has(id));
}
