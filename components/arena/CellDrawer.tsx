"use client";

import { useMemo, useState } from "react";
import {
  formatLatency,
  formatScore,
  formatTokens,
  formatUsd,
} from "@/lib/format";
import type { Category } from "@/lib/schemas";
import { cellKey, streamKeyCandidate } from "@/lib/client/runStore";
import {
  useRunStore,
  useRunStoreApi,
  useStreamBuffer,
} from "@/lib/client/useRunStream";
import { JudgeVerdictCard } from "@/components/arena/JudgeVerdictCard";
import { TrialTabs } from "@/components/arena/TrialTabs";
import { ValidatorPanel, validatorSummary } from "@/components/arena/ValidatorPanel";
import { Button } from "@/components/ui/Button";
import { DisagreementFlag } from "@/components/ui/DisagreementFlag";
import { Drawer } from "@/components/ui/Drawer";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { StreamPanel } from "@/components/ui/StreamPanel";
import { Tabs } from "@/components/ui/Tabs";
import { VerdictBadge } from "@/components/ui/VerdictBadge";

function shortName(id: string): string {
  const slash = id.lastIndexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

/** URL-addressable cell detail drawer (plans/09 §2.4). */
export function CellDrawer({
  candidateModelId,
  category,
  trialFromUrl,
  onClose,
  onTrialChange,
}: {
  candidateModelId: string | null;
  category: Category | null;
  trialFromUrl: number | null;
  onClose: () => void;
  onTrialChange: (trialIndex: number) => void;
}) {
  const open = !!candidateModelId && !!category;
  const cell = useRunStore((s) =>
    candidateModelId && category
      ? s.cells.get(cellKey(candidateModelId, category))
      : undefined,
  );
  const api = useRunStoreApi();

  const trialIndices = useMemo(
    () => (cell ? [...cell.trials.keys()].sort((a, b) => a - b) : []),
    [cell],
  );
  const preferredTrial = useMemo(() => {
    if (!cell) return 0;
    const scored = trialIndices.find((i) => {
      const t = cell.trials.get(i);
      return t?.status === "scored" && t.median != null;
    });
    return scored ?? trialIndices[0] ?? 0;
  }, [cell, trialIndices]);
  const activeTrial =
    trialFromUrl != null && trialIndices.includes(trialFromUrl)
      ? trialFromUrl
      : preferredTrial;
  const trial = cell?.trials.get(activeTrial);
  const [tab, setTab] = useState("answer");

  const buf = useStreamBuffer(
    trial ? streamKeyCandidate(trial.taskResultId) : null,
  );

  const streamStatus =
    trial?.status === "streaming"
      ? "streaming"
      : trial?.status === "error"
        ? "error"
        : buf.text || trial?.answer.text
          ? "done"
          : "idle";

  const answerText =
    streamStatus === "streaming" ? buf.text : (trial?.answer.text || buf.text);

  // Majority verdict across judges (display only)
  const majorityVerdict = useMemo(() => {
    if (!trial) return null;
    const counts = { pass: 0, partial_pass: 0, fail: 0 };
    for (const j of trial.judges.values()) {
      const v = j.verdict;
      if (v === "pass" || v === "partial_pass" || v === "fail") {
        counts[v] += 1;
      }
    }
    const best = (Object.entries(counts) as Array<[keyof typeof counts, number]>).sort(
      (a, b) => b[1] - a[1],
    )[0];
    return best && best[1] > 0 ? best[0] : null;
  }, [trial]);

  const summary = validatorSummary(trial?.checks);
  const judges = trial ? [...trial.judges.values()] : [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      testId="cell-drawer"
      title={
        open ? (
          <div className="min-w-0">
            <div className="truncate font-mono text-sm text-bright">
              {shortName(candidateModelId!)} × {category}
              {trialIndices.length > 1 && (
                <span className="text-dim">
                  {" "}
                  · trial {activeTrial + 1}/{trialIndices.length}
                </span>
              )}
            </div>
          </div>
        ) : (
          ""
        )
      }
      headerAside={
        <div className="flex items-center gap-2">
          {majorityVerdict && <VerdictBadge verdict={majorityVerdict} size="sm" />}
          <ScoreBadge
            score={trial?.median ?? cell?.medianAcrossTrials ?? null}
            size="md"
          />
        </div>
      }
      footer={
        trial?.status === "error" ? (
          <Button
            variant="secondary"
            onClick={() => void api.retryTask(trial.taskResultId)}
            loading={api.controlPending === "retry"}
          >
            Retry task
          </Button>
        ) : undefined
      }
    >
      {open && (
        <div className="flex flex-col gap-4">
          <TrialTabs
            trialCount={trialIndices.length}
            activeTrial={activeTrial}
            onChange={onTrialChange}
          />

          {trial?.spread != null && trial.spread > 3 && (
            <DisagreementFlag spread={trial.spread} />
          )}

          {summary && (
            <p className="font-mono text-xs text-dim">{summary}</p>
          )}

          {/* Wide: stacked sections; tabs still for focus */}
          <Tabs
            tabs={[
              { key: "answer", label: "Answer" },
              { key: "checks", label: "Checks" },
              { key: "judges", label: "Judges" },
            ]}
            activeKey={tab}
            onChange={setTab}
            ariaLabel="Cell detail"
            idBase="cell-detail"
            className="lg:hidden"
          />

          <div className="flex flex-col gap-6">
            <section className={tab === "answer" ? "block" : "hidden lg:block"}>
              <h3 className="mb-2 hidden text-xs uppercase tracking-wide text-dim lg:block">
                Answer
              </h3>
              <StreamPanel
                text={answerText}
                status={streamStatus}
                label={`Candidate — ${candidateModelId}`}
                markdown={streamStatus === "done"}
              />
              {trial && (trial.answer.tokens > 0 || trial.answer.costUsd != null) && (
                <p className="mt-2 flex flex-wrap gap-x-3 font-mono text-xs text-dim">
                  <span>
                    {formatTokens(
                      (trial.answer.promptTokens ?? 0) + trial.answer.tokens,
                    )}{" "}
                    tok
                  </span>
                  {trial.answer.costUsd != null && (
                    <span>{formatUsd(trial.answer.costUsd)}</span>
                  )}
                  {trial.answer.latencyMs != null && (
                    <span>{formatLatency(trial.answer.latencyMs)}</span>
                  )}
                  {trial.answer.finishReason && (
                    <span>finish: {trial.answer.finishReason}</span>
                  )}
                </p>
              )}
              {trial?.error && (
                <p className="mt-2 text-sm text-fail-400">
                  {trial.error.kind}: {trial.error.message}
                </p>
              )}
            </section>

            <section className={tab === "checks" ? "block" : "hidden lg:block"}>
              <h3 className="mb-2 hidden text-xs uppercase tracking-wide text-dim lg:block">
                Checks
              </h3>
              <ValidatorPanel checks={trial?.checks ?? []} />
            </section>

            <section className={tab === "judges" ? "block" : "hidden lg:block"}>
              <h3 className="mb-2 hidden text-xs uppercase tracking-wide text-dim lg:block">
                Judges
              </h3>
              {judges.length === 0 ? (
                <p className="text-sm text-dim">No judgments yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                  {judges.map((j) => (
                    <JudgeVerdictCard
                      key={j.judgeModelId}
                      taskResultId={trial!.taskResultId}
                      judge={j}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Keep score readout for SR */}
          <span className="sr-only">
            Median {trial?.median != null ? formatScore(trial.median) : "pending"}
          </span>
        </div>
      )}
    </Drawer>
  );
}
