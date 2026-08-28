"use client";

import { useState } from "react";
import { DisagreementFlag } from "@/components/ui/DisagreementFlag";
import { FeedbackChipList } from "@/components/ui/FeedbackChip";
import { Select } from "@/components/ui/Input";
import { StreamPanel } from "@/components/ui/StreamPanel";
import { formatRelativeTime, formatScore } from "@/lib/format";
import type { CompareTaskOption, SameTaskAnswer } from "@/lib/analytics/types";

export type SameTaskAnswersProps = {
  modelIds: string[];
  tasks: CompareTaskOption[];
  initialTaskId?: string;
  /** Preloaded answers keyed by task id. */
  answersByTask: Record<string, SameTaskAnswer[]>;
};

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

/** Side-by-side archived answers for one pack task (plans/10 §3.2). */
export function SameTaskAnswers({
  modelIds,
  tasks,
  initialTaskId,
  answersByTask,
}: SameTaskAnswersProps) {
  const firstId = tasks[0]?.id ?? "";
  const [taskId, setTaskId] = useState(
    initialTaskId && tasks.some((t) => t.id === initialTaskId)
      ? initialTaskId
      : firstId,
  );
  const answers = answersByTask[taskId] ?? [];
  const byId = new Map(answers.map((a) => [a.modelId, a]));
  const selected = tasks.find((t) => t.id === taskId);

  if (tasks.length === 0) return null;

  return (
    <section aria-labelledby="same-task-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="same-task-heading" className="text-sm uppercase tracking-wide text-dim">
          Same-task answers
        </h2>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-dim">
          Task
          <Select
            value={taskId}
            aria-label="Same-task prompt"
            className="min-w-[160px]"
            onChange={(e) => setTaskId(e.target.value)}
          >
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
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
                No scored answer for {selected?.title ?? "this task"}.
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
