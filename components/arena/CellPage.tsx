"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { buildCellHref } from "@/lib/cellRef";
import {
  formatLatency,
  formatScore,
  formatTokens,
  formatUsd,
  scoreBand,
} from "@/lib/format";
import { renderMarkdown } from "@/lib/markdown";
import type { Category, RunSnapshot } from "@/lib/schemas";
import { cellKey, streamKeyCandidate, type JudgeVerdict, type TrialState } from "@/lib/client/runStore";
import {
  RunStoreProvider,
  useRunStore,
  useRunStoreApi,
  useStreamBuffer,
} from "@/lib/client/useRunStream";
import { CountUp } from "@/components/arena/CountUp";
import { JudgeVerdictCard } from "@/components/arena/JudgeVerdictCard";
import { StatusTimeline } from "@/components/arena/cell/StatusTimeline";
import { TrialTabs } from "@/components/arena/TrialTabs";
import { ValidatorPanel, validatorSummary } from "@/components/arena/ValidatorPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { DisagreementFlag } from "@/components/ui/DisagreementFlag";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { StatusDot } from "@/components/ui/StatusDot";
import { StreamPanel } from "@/components/ui/StreamPanel";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { VerdictBadge } from "@/components/ui/VerdictBadge";

function shortName(id: string): string {
  const slash = id.lastIndexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

function enterStyle(i: number): CSSProperties {
  return { "--enter-index": i } as CSSProperties;
}

/* ---------------- Prompt panel ---------------- */

function PromptPanel({
  task,
  category,
}: {
  task: RunSnapshot["tasks"][number] | undefined;
  category: Category;
}) {
  const html = task ? renderMarkdown(task.task_body) : null;
  return (
    <section
      aria-label="Prompt"
      data-testid="cell-prompt"
      className="panel-enter flex flex-col rounded-md border border-line-subtle bg-ink-900"
      style={enterStyle(0)}
    >
      <header className="flex items-center justify-between gap-2 border-b border-line-subtle px-4 py-2.5">
        <h2 className="text-xs uppercase tracking-wide text-dim">Prompt</h2>
        <div className="flex items-center gap-2 font-mono text-[10px] text-faint">
          <Badge tone="neutral">{category}</Badge>
          {task && <span>{formatTokens(task.token_limit)} tok cap</span>}
        </div>
      </header>
      <div className="max-h-[26rem] overflow-y-auto p-4">
        {html ? (
          <div
            className="md-body"
            // Sanitized by lib/markdown.ts (marked + DOMPurify allowlist).
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-sm text-dim">Prompt unavailable for this run.</p>
        )}
      </div>
    </section>
  );
}

/* ---------------- Stat chips ---------------- */

function StatChip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-sm border border-line-subtle bg-ink-900 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-wide text-faint">
        {label}
      </span>
      <span className="font-mono text-sm tabular-nums text-bright">{children}</span>
    </div>
  );
}

function StatChips({ trial }: { trial: TrialState | undefined }) {
  const totalTokens =
    trial && trial.answer.promptTokens != null
      ? trial.answer.promptTokens + trial.answer.tokens
      : trial && trial.answer.tokens > 0 && trial.status !== "streaming"
        ? trial.answer.tokens
        : null;
  return (
    <div
      data-testid="cell-stat-chips"
      className="panel-enter grid grid-cols-2 gap-2 sm:grid-cols-4"
      style={enterStyle(2)}
    >
      <StatChip label="Tokens">
        <CountUp value={totalTokens} format={(n) => formatTokens(Math.round(n))} />
      </StatChip>
      <StatChip label="Cost">
        <CountUp value={trial?.answer.costUsd ?? null} format={formatUsd} />
      </StatChip>
      <StatChip label="Latency">
        <CountUp
          value={trial?.answer.latencyMs ?? null}
          format={(n) => formatLatency(Math.round(n))}
        />
      </StatChip>
      <StatChip label="Finish">
        {trial?.answer.finishReason ?? "—"}
      </StatChip>
    </div>
  );
}

/* ---------------- Compact judge row (above the fold) ---------------- */

function JudgeRowCard({
  judge,
  expectedModelId,
  index,
}: {
  judge: JudgeVerdict | undefined;
  expectedModelId: string;
  index: number;
}) {
  const started = judge?.started ?? false;
  const done = judge?.verdict != null;
  return (
    <article
      className="panel-enter flex flex-col gap-2 rounded-md border border-line-subtle bg-ink-900 p-3"
      style={enterStyle(4 + index)}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs text-dim">
          {shortName(judge?.judgeModelId ?? expectedModelId)}
        </span>
        {done ? (
          <StatusDot tone="done" label="scored" />
        ) : started ? (
          <StatusDot tone="streaming" label="judging" />
        ) : (
          <StatusDot tone="idle" label="waiting" />
        )}
      </header>
      <div className="flex items-center justify-between gap-2">
        {done ? (
          <span className="score-pop">
            <VerdictBadge verdict={judge!.verdict!} size="sm" />
          </span>
        ) : (
          <span className="text-xs text-faint">{started ? "reading…" : "queued"}</span>
        )}
        <span className="font-mono text-lg tabular-nums text-bright">
          <CountUp
            value={judge?.serverOverall ?? null}
            format={formatScore}
            duration={500}
          />
        </span>
      </div>
    </article>
  );
}

/* ---------------- Below-the-fold tab panels ---------------- */

function TrialsPanel({
  cell,
  activeTrial,
  onSelect,
}: {
  cell: { trials: Map<number, TrialState> };
  activeTrial: number;
  onSelect: (trialIndex: number) => void;
}) {
  const trials = [...cell.trials.entries()].sort((a, b) => a[0] - b[0]);
  return (
    <div className="flex flex-col gap-2">
      {trials.map(([idx, t]) => {
        const active = idx === activeTrial;
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onSelect(idx)}
            aria-current={active}
            className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-4 py-3 text-left transition-colors duration-150",
              active
                ? "border-teal-400/50 bg-teal-900/30"
                : "border-line-subtle bg-ink-900 hover:bg-ink-800",
            )}
          >
            <span className="font-mono text-sm text-bright">Trial {idx + 1}</span>
            <Badge
              tone={
                t.status === "scored"
                  ? "pass"
                  : t.status === "error"
                    ? "fail"
                    : "neutral"
              }
            >
              {t.status}
            </Badge>
            <span className="font-mono text-sm tabular-nums text-body">
              {t.median != null ? formatScore(t.median) : "—"}
            </span>
            {t.spread != null && (
              <span className="font-mono text-xs text-dim">
                spread {formatScore(t.spread)}
              </span>
            )}
            <span className="ml-auto flex gap-3 font-mono text-xs text-dim">
              {t.answer.costUsd != null && <span>{formatUsd(t.answer.costUsd)}</span>}
              {t.answer.latencyMs != null && <span>{formatLatency(t.answer.latencyMs)}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TelemetryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-subtle/60 py-2 last:border-0">
      <dt className="text-sm text-dim">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-body">{value}</dd>
    </div>
  );
}

function TelemetryPanel({ trial }: { trial: TrialState | undefined }) {
  if (!trial) return <p className="text-sm text-dim">No telemetry yet.</p>;
  const judges = [...trial.judges.values()];
  const judgeCost = judges.reduce((s, j) => s + (j.costUsd ?? 0), 0);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-label="Candidate telemetry">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-dim">Candidate</h3>
        <dl className="rounded-md border border-line-subtle bg-ink-900 px-4 py-2">
          <TelemetryRow label="Prompt tokens" value={formatTokens(trial.answer.promptTokens)} />
          <TelemetryRow label="Completion tokens" value={formatTokens(trial.answer.tokens)} />
          <TelemetryRow label="Cost" value={formatUsd(trial.answer.costUsd)} />
          <TelemetryRow label="Latency" value={formatLatency(trial.answer.latencyMs)} />
          <TelemetryRow label="Finish reason" value={trial.answer.finishReason ?? "—"} />
        </dl>
      </section>
      <section aria-label="Judge telemetry">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-dim">Judges</h3>
        <dl className="rounded-md border border-line-subtle bg-ink-900 px-4 py-2">
          {judges.length === 0 && (
            <TelemetryRow label="Judge calls" value="none yet" />
          )}
          {judges.map((j) => (
            <TelemetryRow
              key={j.judgeModelId}
              label={shortName(j.judgeModelId)}
              value={`${formatUsd(j.costUsd)} · ${formatLatency(j.latencyMs)}`}
            />
          ))}
          <TelemetryRow label="Judge cost subtotal" value={formatUsd(judges.length ? judgeCost : null)} />
          <TelemetryRow
            label="Median / spread"
            value={
              trial.median != null
                ? `${formatScore(trial.median)} / ${formatScore(trial.spread)}`
                : "—"
            }
          />
        </dl>
      </section>
    </div>
  );
}

function RawPanel({
  trial,
  answerText,
  runId,
}: {
  trial: TrialState | undefined;
  answerText: string;
  runId: string;
}) {
  const api = useRunStoreApi();
  return (
    <div className="flex flex-col gap-4">
      <dl className="rounded-md border border-line-subtle bg-ink-900 px-4 py-2">
        <TelemetryRow label="Task result id" value={trial?.taskResultId ?? "—"} />
        <TelemetryRow label="Task id" value={trial?.taskId ?? "—"} />
        <TelemetryRow label="Run id" value={runId} />
        <TelemetryRow label="Request hash" value={trial?.requestHash ?? "—"} />
      </dl>

      {trial?.error && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-fail-400/30 bg-fail-900 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-fail-400">
            {trial.error.kind}: {trial.error.message}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void api.retryTask(trial.taskResultId)}
            loading={api.controlPending === "retry"}
          >
            Retry task
          </Button>
        </div>
      )}

      <section aria-label="Raw candidate output">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wide text-dim">Raw output</h3>
          <CopyButton text={answerText} label="raw output" />
        </div>
        <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-md border border-line-subtle bg-ink-950 p-4 font-mono text-xs text-body">
          {answerText || "—"}
        </pre>
      </section>
    </div>
  );
}

/* ---------------- Page ---------------- */

function CellPageInner({
  runId,
  snapshot,
  candidateModelId,
  category,
  trialFromUrl,
}: {
  runId: string;
  snapshot: RunSnapshot;
  candidateModelId: string;
  category: Category;
  trialFromUrl: number | null;
}) {
  const router = useRouter();
  const cell = useRunStore((s) => s.cells.get(cellKey(candidateModelId, category)));
  const showJudgeStreams = useRunStore((s) => s.showJudgeStreams);
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

  const buf = useStreamBuffer(trial ? streamKeyCandidate(trial.taskResultId) : null);

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

  const task = useMemo(
    () => snapshot.tasks.find((t) => t.category === category),
    [snapshot.tasks, category],
  );
  const expectedJudges = useMemo(() => {
    const panel = snapshot.panels.find((p) => p.category === category);
    return panel?.judges.filter(Boolean) ?? [];
  }, [snapshot.panels, category]);

  const judges = trial ? [...trial.judges.values()] : [];
  const majorityVerdict = useMemo(() => {
    if (!trial) return null;
    const counts = { pass: 0, partial_pass: 0, fail: 0 };
    for (const j of trial.judges.values()) {
      const v = j.verdict;
      if (v === "pass" || v === "partial_pass" || v === "fail") counts[v] += 1;
    }
    const best = (Object.entries(counts) as Array<[keyof typeof counts, number]>).sort(
      (a, b) => b[1] - a[1],
    )[0];
    return best && best[1] > 0 ? best[0] : null;
  }, [trial]);

  const [tab, setTab] = useState("checks");
  const summary = validatorSummary(trial?.checks);
  const flagged = !!trial?.flagged || (trial?.spread != null && trial.spread > 3);
  const medianBand = trial?.median != null ? scoreBand(trial.median) : null;

  const selectTrial = (t: number) => {
    router.replace(buildCellHref(runId, candidateModelId, category, t), {
      scroll: false,
    });
  };

  const judgeRowModels =
    expectedJudges.length > 0
      ? expectedJudges
      : judges.map((j) => j.judgeModelId);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 md:px-10">
      {/* Header */}
      <header className="panel-enter flex flex-wrap items-center justify-between gap-3" style={enterStyle(0)}>
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/runs/${encodeURIComponent(runId)}`}
            className="shrink-0 rounded-sm border border-line-subtle px-2.5 py-1.5 text-xs text-dim transition-colors duration-150 hover:bg-ink-800 hover:text-bright"
          >
            ← Arena
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-mono text-sm text-bright">
              {shortName(candidateModelId)} × {category}
              {trialIndices.length > 1 && (
                <span className="text-dim">
                  {" "}
                  · trial {activeTrial + 1}/{trialIndices.length}
                </span>
              )}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {flagged && (
            <span className="pulse-dot">
              <DisagreementFlag spread={trial?.spread ?? 0} />
            </span>
          )}
          {majorityVerdict && <VerdictBadge verdict={majorityVerdict} size="sm" />}
          <ScoreBadge
            score={trial?.median ?? cell?.medianAcrossTrials ?? null}
            size="md"
          />
        </div>
      </header>

      {/* Status timeline */}
      <div className="panel-enter rounded-md border border-line-subtle bg-ink-900 px-4 py-3" style={enterStyle(1)}>
        <StatusTimeline status={trial?.status} errorKind={trial?.error?.kind} />
      </div>

      {/* Main stage: prompt + answer */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PromptPanel task={task} category={category} />
        <section
          aria-label="Candidate answer"
          className="panel-enter flex flex-col gap-3"
          style={enterStyle(1)}
        >
          <StreamPanel
            text={answerText}
            status={streamStatus}
            label={`Candidate — ${candidateModelId}`}
            markdown={streamStatus === "done"}
            maxHeight={420}
          />
          {trial?.error && (
            <p className="text-sm text-fail-400">
              {trial.error.kind}: {trial.error.message}
            </p>
          )}
        </section>
      </div>

      <StatChips trial={trial} />

      {/* Judge row */}
      <section aria-label="Judge scores" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wide text-dim">Judges</h2>
          {trial?.median != null && (
            <span className={cn("font-mono text-sm tabular-nums", medianBand?.text ?? "text-bright")}>
              median{" "}
              <CountUp value={trial.median} format={formatScore} duration={700} />
            </span>
          )}
        </div>
        {judgeRowModels.length === 0 ? (
          <p className="panel-enter text-sm text-dim" style={enterStyle(4)}>
            Waiting for judge panel…
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {judgeRowModels.map((modelId, i) => (
              <JudgeRowCard
                key={modelId}
                judge={judges.find((j) => j.judgeModelId === modelId)}
                expectedModelId={modelId}
                index={i}
              />
            ))}
          </div>
        )}
      </section>

      {/* Trials switcher */}
      {trialIndices.length > 1 && (
        <TrialTabs
          trialCount={trialIndices.length}
          activeTrial={activeTrial}
          onChange={selectTrial}
        />
      )}

      {/* Below the fold: deep-dive tabs */}
      <section aria-label="Cell detail" className="flex flex-col gap-4 border-t border-line-subtle pt-4">
        <Tabs
          tabs={[
            { key: "checks", label: "Checks" },
            { key: "judges", label: "Judges" },
            { key: "trials", label: "Trials" },
            { key: "telemetry", label: "Telemetry" },
            { key: "raw", label: "Raw" },
          ]}
          activeKey={tab}
          onChange={setTab}
          ariaLabel="Cell detail sections"
          idBase="cell-page"
        />

        <TabPanel tabKey="checks" idBase="cell-page" activeKey={tab}>
          <div className="flex flex-col gap-3">
            {summary && <p className="font-mono text-xs text-dim">{summary}</p>}
            <ValidatorPanel checks={trial?.checks ?? []} />
          </div>
        </TabPanel>

        <TabPanel tabKey="judges" idBase="cell-page" activeKey={tab}>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-xs text-dim">
              <input
                type="checkbox"
                checked={showJudgeStreams}
                onChange={(e) => api.setShowJudgeStreams(e.target.checked)}
                className="accent-teal-400"
              />
              Show raw judge streams
            </label>
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
          </div>
        </TabPanel>

        <TabPanel tabKey="trials" idBase="cell-page" activeKey={tab}>
          {cell ? (
            <TrialsPanel cell={cell} activeTrial={activeTrial} onSelect={selectTrial} />
          ) : (
            <p className="text-sm text-dim">No trials yet.</p>
          )}
        </TabPanel>

        <TabPanel tabKey="telemetry" idBase="cell-page" activeKey={tab}>
          <TelemetryPanel trial={trial} />
        </TabPanel>

        <TabPanel tabKey="raw" idBase="cell-page" activeKey={tab}>
          <RawPanel trial={trial} answerText={answerText} runId={runId} />
        </TabPanel>
      </section>

      {/* Keep score readout for SR */}
      <span className="sr-only">
        Median {trial?.median != null ? formatScore(trial.median) : "pending"}
      </span>
    </div>
  );
}

/** Client root: RunStore provider + cell detail page (plans/15 §A3). */
export function CellPage({
  runId,
  snapshot,
  candidateModelId,
  category,
  trialFromUrl,
}: {
  runId: string;
  snapshot: RunSnapshot;
  candidateModelId: string;
  category: Category;
  trialFromUrl: number | null;
}) {
  return (
    <RunStoreProvider runId={runId} initialSnapshot={snapshot}>
      <CellPageInner
        runId={runId}
        snapshot={snapshot}
        candidateModelId={candidateModelId}
        category={category}
        trialFromUrl={trialFromUrl}
      />
    </RunStoreProvider>
  );
}
