import type { Category } from "@/lib/schemas";

const BRIEF_MAX = 2_000;

export const CATEGORY_LABELS: Record<Category, string> = {
  roleplay: "Roleplay",
  coding: "Coding",
  math: "Math",
  research: "Research",
  marketing: "Marketing",
  poster: "Poster",
  story: "Story",
  judging: "Judging",
  general: "General",
  other: "Other",
};

export type PackSlot = {
  category: Category;
  prompt: string;
};

/** Number duplicate types so two coding slots read "Coding 1" / "Coding 2". */
export function labeledTaskTitles<T extends { category: Category }>(
  tasks: T[],
): Array<T & { title: string }> {
  const totals = new Map<Category, number>();
  for (const t of tasks) {
    totals.set(t.category, (totals.get(t.category) ?? 0) + 1);
  }
  const seen = new Map<Category, number>();
  return tasks.map((t) => {
    const n = (seen.get(t.category) ?? 0) + 1;
    seen.set(t.category, n);
    const base = CATEGORY_LABELS[t.category];
    const title = (totals.get(t.category) ?? 1) > 1 ? `${base} ${n}` : base;
    return { ...t, title };
  });
}

export function briefFromSlots(slots: PackSlot[]): string {
  return slots
    .map((s, i) => `${i + 1}. [${s.category}] ${s.prompt.trim()}`)
    .join("\n")
    .slice(0, BRIEF_MAX);
}
