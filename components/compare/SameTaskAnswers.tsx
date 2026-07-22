"use client";

import { useState } from "react";
import { DisagreementFlag } from "@/components/ui/DisagreementFlag";
import { FeedbackChipList } from "@/components/ui/FeedbackChip";
import { Select } from "@/components/ui/Input";
import { StreamPanel } from "@/components/ui/StreamPanel";
import { formatRelativeTime, formatScore } from "@/lib/format";
import { CATEGORY_ORDER, type Category } from "@/lib/schemas";
import type { SameTaskAnswer } from "@/lib/server/analytics";

export type SameTaskAnswersProps = {
  modelIds: string[];
  initialCategory?: Category;
  /** Preloaded answers keyed by category (server-fetched for all 8 or just one). */
  answersByCategory: Partial<Record<Category, SameTaskAnswer[]>>;
  /** Optional client refetch hook — when category changes without preload. */
  onCategoryChange?: (category: Category) => void;
};

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** Side-by-side archived answers for one category (plans/10 §3.2). */
export function SameTaskAnswers({
  modelIds,
  initialCategory = "coding",
  answersByCategory,
  onCategoryChange,
}: SameTaskAnswersProps) {
  const [category, setCategory] = useState<Category>(initialCategory);
  const answers = answersByCategory[category] ?? [];
  const byId = new Map(answers.map((a) => [a.modelId, a]));

  return (
    <section aria-labelledby="same-task-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="same-task-heading" className="text-sm uppercase tracking-wide text-dim">
          Same-task answers
        </h2>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-dim">
          Category
          <Select
            value={category}
            aria-label="Same-task category"
            className="min-w-[160px]"
            onChange={(e) => {
              const c = e.target.value as Category;
              setCategory(c);
              onCategoryChange?.(c);
            }}
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {capitalize(c)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {modelIds.map((id) => {
          const a = byId.get(id);
          if (!a || !a.found) {
            return (
              <div
                key={id}
                className="rounded-md border border-dashed border-line-subtle px-3 py-4 text-sm text-dim"
              >
                <div className="mb-1 text-bright">{modelShort(id)}</div>
                No complete run for {capitalize(category)}.
              </div>
            );
          }

          return (
            <div
              key={id}
              className="flex min-w-0 flex-col gap-2 rounded-md border border-line-subtle bg-ink-900 p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm text-bright">{modelShort(id)}</div>
                <div className="font-mono text-[11px] text-dim">
                  {formatScore(a.median)} · spread {formatScore(a.spread)}
                </div>
              </div>
              <p className="font-mono text-[11px] text-faint">
                {a.runId?.slice(0, 8)} · {formatRelativeTime(a.runDate)}
              </p>

              {a.flagged && <DisagreementFlag spread={a.spread ?? 0} />}

              <div className="text-xs text-dim">
                Validators {a.validatorsPassed}/{a.validatorsTotal}
              </div>

              <StreamPanel
                text={a.answer ?? ""}
                status="done"
                label={`Answer — ${modelShort(id)}`}
                markdown
                defaultCollapsed
                maxHeight={280}
              />

              <div className="flex flex-col gap-1.5">
                <FeedbackChipList kind="good" items={a.feedback.good} />
                <FeedbackChipList kind="terrible" items={a.feedback.terrible} />
                <FeedbackChipList kind="missing" items={a.feedback.missing} />
                {a.feedback.improvements[0] && (
                  <p className="text-xs text-body">
                    <span className="text-dim">Best improvement: </span>
                    {a.feedback.improvements[0]}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
