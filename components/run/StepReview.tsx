"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatDuration,
  formatTokens,
  formatUsd,
  formatUsdRange,
} from "@/lib/format";
import { apiFetch } from "@/lib/client/apiKey";
import type { RunDraft } from "@/lib/client/runDraft";
import { OverlapWarning } from "@/components/run/OverlapWarning";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import type { PreflightResponse } from "@/lib/schemas";

export type PreflightOk = PreflightResponse;

/** Step 4 — preflight stats, cap, launch (plans/09 §1.5). */
export function StepReview({
  draft,
  bundleLabel,
  onDraftPatch,
  onGotoStep,
  onLaunch,
  launching,
}: {
  draft: RunDraft;
  bundleLabel: string;
  onDraftPatch: (patch: Partial<RunDraft>) => void;
  onGotoStep: (step: 1 | 2 | 3) => void;
  onLaunch: (seed: number) => void;
  launching: boolean;
}) {
  const [preflight, setPreflight] = useState<PreflightOk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmLowCap, setConfirmLowCap] = useState(false);
  const reqId = useRef(0);

  const overlap = draft.candidateIds.filter((id) => draft.judgePoolIds.includes(id));
  const escalate = overlap.length > 0 && draft.judgePoolIds.length < 4;

  const load = async () => {
    if (!draft.bundleId) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/runs/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundle_id: draft.bundleId,
          candidate_model_ids: draft.candidateIds,
          judge_pool_model_ids: draft.judgePoolIds,
          categories: draft.categories,
          trials_per_pair: draft.trials,
          candidate_concurrency: draft.candidateConcurrency,
          budget_usd: draft.budgetUsd,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        if (body?.error?.code === "NEEDS_KEY") {
          throw new Error(
            body.error.message ??
              "Add your OpenRouter API key in Settings to run preflight.",
          );
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as PreflightOk;
      if (id !== reqId.current) return;
      setPreflight(data);
    } catch (err) {
      if (id !== reqId.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Preflight failed — check the network and retry.",
      );
      setPreflight(null);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draft.bundleId,
    draft.candidateIds.join(","),
    draft.judgePoolIds.join(","),
    draft.categories.join(","),
    draft.trials,
    draft.candidateConcurrency,
    draft.budgetUsd,
  ]);

  const blockingErrors = preflight?.errors ?? [];
  const warnings = preflight?.warnings ?? [];
  const est = preflight?.estimate;
  const canLaunch =
    !loading && !error && !!preflight?.ok && blockingErrors.length === 0 && !launching;

  const tryLaunch = () => {
    if (!est || !preflight) return;
    if (draft.budgetUsd < est.cost_usd_max * 0.5) {
      setConfirmLowCap(true);
      return;
    }
    onLaunch(preflight.seed);
  };

  const stepForError = (code: string): 1 | 2 | 3 => {
    if (code.toLowerCase().includes("bundle") || code.toLowerCase().includes("categor")) return 1;
    if (code.toLowerCase().includes("judge")) return 3;
    return 2;
  };

  return (
    <div className="flex flex-col gap-5" data-testid="step-heading-4">
      <div>
        <h2 className="text-xl text-bright">Review & launch</h2>
        <p className="mt-1 font-mono text-sm text-dim">
          {bundleLabel} · {draft.categories.length} categories ·{" "}
          {draft.candidateIds.length} candidates · {draft.judgePoolIds.length} judges
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-body">Trials per task</span>
          <Select
            value={draft.trials}
            onChange={(e) => onDraftPatch({ trials: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <span className="text-xs text-faint">recommended: 3</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-body">Candidate concurrency</span>
          <Select
            value={draft.candidateConcurrency}
            onChange={(e) =>
              onDraftPatch({ candidateConcurrency: Number(e.target.value) })
            }
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-fail-400/30 bg-fail-900 px-3 py-2 text-sm text-fail-400"
        >
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && est && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Requests" value={String(est.request_count)} />
          <StatCard
            label="Est tokens"
            value={`~${formatTokens(est.prompt_tokens_est + est.completion_tokens_est)}`}
          />
          <StatCard
            label="Cost range"
            value={formatUsdRange(est.cost_usd_min, est.cost_usd_max)}
            sub={`expected ${formatUsd(est.cost_usd_expected)}`}
          />
          <StatCard
            label="Est duration"
            value={formatDuration(est.duration_est_seconds * 1000)}
          />
        </div>
      )}

      <label className="flex max-w-xs flex-col gap-1.5">
        <span className="text-sm text-body">Hard spending cap</span>
        <span className="relative">
          <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-dim">
            $
          </span>
          <Input
            type="number"
            inputMode="decimal"
            min={0.1}
            step={0.1}
            value={draft.budgetUsd}
            onChange={(e) => onDraftPatch({ budgetUsd: e.target.valueAsNumber || 0 })}
            className="pl-7"
          />
        </span>
        <span className="text-xs text-faint">run stops at cap (incomplete)</span>
      </label>

      <OverlapWarning overlap={overlap} escalate={escalate} />

      {blockingErrors.length > 0 && (
        <ul className="flex flex-col gap-2" role="list">
          {blockingErrors.map((e, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onGotoStep(stepForError(e.code))}
                className="w-full rounded-md border border-fail-400/30 bg-fail-900 px-3 py-2 text-left text-sm text-fail-400 hover:border-fail-400/60"
              >
                <span className="font-mono text-xs uppercase">{e.code}</span>
                <span className="mt-0.5 block">{e.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm text-warn-400">
          {warnings.map((w, i) => (
            <li key={i}>⚠ {w.message}</li>
          ))}
        </ul>
      )}

      <div className="flex justify-end border-t border-line-subtle pt-4">
        <Button
          variant="primary"
          size="lg"
          disabled={!canLaunch}
          loading={launching}
          onClick={tryLaunch}
        >
          Launch benchmark →
        </Button>
      </div>

      <Modal
        open={confirmLowCap}
        onClose={() => setConfirmLowCap(false)}
        title="Cap below estimate"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmLowCap(false)}>
              Adjust cap
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmLowCap(false);
                if (preflight) onLaunch(preflight.seed);
              }}
            >
              Launch anyway
            </Button>
          </div>
        }
      >
        <p className="text-sm text-body">
          Cap is below the estimated cost — the run will likely stop early and be
          marked incomplete. Launch anyway?
        </p>
      </Modal>
    </div>
  );
}
