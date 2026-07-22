"use client";

import { cn } from "@/lib/cn";
import { formatScore, formatUsd, scoreBand } from "@/lib/format";
import type { ChatLiveState } from "@/lib/client/useChatStream";
import { Badge } from "@/components/ui/Badge";
import { FeedbackChipList } from "@/components/ui/FeedbackChip";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { VerdictBadge } from "@/components/ui/VerdictBadge";

const SCORE_KEYS = [
  ["correctness", "Correctness"],
  ["requirement_compliance", "Compliance"],
  ["quality", "Quality"],
  ["honesty", "Honesty"],
] as const;

function ScoreBar({ label, value }: { label: string; value: number }) {
  const band = scoreBand(value);
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-dim">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            band.text,
          )}
          style={{
            width: `${(value / 10) * 100}%`,
            backgroundColor: "currentColor",
          }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs tabular-nums text-body">
        {formatScore(value)}
      </span>
    </div>
  );
}

/** Category vote + median score + per-judge verdicts for the latest round. */
export function JudgingPanel({ state }: { state: ChatLiveState }) {
  const judging = state.status === "judging";

  return (
    <aside className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg text-bright">Judging</h2>
          <p className="mt-0.5 text-xs text-dim">
            {state.judgingRounds > 0
              ? `Round ${state.judgingRounds}${state.category ? ` · ${state.category}` : ""}`
              : "Not judged yet"}
          </p>
        </div>
        <ScoreBadge score={state.medianScore} size="lg" />
      </header>

      <div className="flex flex-wrap gap-2">
        {state.category && <Badge tone="teal">{state.category}</Badge>}
        {state.disagreement != null && (
          <Badge tone={state.disagreement > 3 ? "warn" : "neutral"}>
            Δ {formatScore(state.disagreement)}
          </Badge>
        )}
        <Badge tone="neutral">{formatUsd(state.totalCostUsd)}</Badge>
        {judging && <Badge tone="info">judging…</Badge>}
      </div>

      {state.classifyVotes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-dim">
            Classification votes
          </h3>
          <ul className="flex flex-col gap-1.5">
            {state.classifyVotes.map((v) => (
              <li
                key={v.judgeModelId}
                className="rounded-md border border-line-subtle bg-ink-900 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px] text-dim">
                    {v.judgeModelId}
                  </span>
                  <Badge tone="teal">
                    {v.category} · {Math.round(v.confidence * 100)}%
                  </Badge>
                </div>
                {v.rationale && (
                  <p className="mt-1 text-xs text-body">{v.rationale}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.judgments.length === 0 ? (
        <p className="text-sm text-dim">
          {judging
            ? "Judges are classifying and scoring the transcript…"
            : "Run a judging round after the candidate replies."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {state.judgments.map((j) => (
            <li
              key={`${j.round}-${j.judge_model_id}`}
              className="flex flex-col gap-3 rounded-md border border-line-subtle bg-ink-900 p-3"
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-dim">
                  {j.judge_model_id}
                </span>
                <div className="flex items-center gap-2">
                  {j.verdict && <VerdictBadge verdict={j.verdict} size="sm" />}
                  <ScoreBadge score={j.server_overall} size="md" />
                </div>
              </header>
              {j.scores && (
                <div className="flex flex-col gap-1.5">
                  {SCORE_KEYS.map(([key, label]) => (
                    <ScoreBar key={key} label={label} value={j.scores![key]} />
                  ))}
                </div>
              )}
              {j.feedback && (
                <div className="flex flex-col gap-2">
                  <FeedbackChipList
                    kind="good"
                    items={j.feedback.what_was_good}
                  />
                  <FeedbackChipList
                    kind="terrible"
                    items={j.feedback.what_was_terrible}
                  />
                  <FeedbackChipList
                    kind="missing"
                    items={j.feedback.what_was_missing}
                  />
                  <FeedbackChipList
                    kind="violation"
                    items={j.feedback.constraint_violations}
                  />
                  <FeedbackChipList
                    kind="critical"
                    items={j.feedback.critical_errors}
                  />
                  {j.feedback.specific_evidence.length > 0 && (
                    <p className="text-xs text-dim">
                      Evidence: {j.feedback.specific_evidence.join(" · ")}
                    </p>
                  )}
                  {j.feedback.one_best_improvement && (
                    <p className="text-xs text-dim">
                      Improve: {j.feedback.one_best_improvement}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
