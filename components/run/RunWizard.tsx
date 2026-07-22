"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PickerModel } from "@/components/models/ModelPicker";
import { StepBundle, type BundleOption } from "@/components/run/StepBundle";
import { StepCandidates } from "@/components/run/StepCandidates";
import { StepJudgePool } from "@/components/run/StepJudgePool";
import { StepReview } from "@/components/run/StepReview";
import {
  WizardStepper,
  type WizardStep,
  WIZARD_STEPS,
} from "@/components/run/WizardStepper";
import { Button } from "@/components/ui/Button";
import { DemoBanner } from "@/components/ui/DemoBanner";
import {
  clearRunDraft,
  defaultRunDraft,
  loadRunDraft,
  newIdempotencyKey,
  saveRunDraft,
  type RunDraft,
} from "@/lib/client/runDraft";
import type { AppSettings } from "@/lib/settings";

export type RunWizardProps = {
  bundles: BundleOption[];
  maxTokenByBundle: Record<string, number>;
  models: PickerModel[];
  settings: AppSettings;
  isDemo: boolean;
};

function parseStep(raw: string | null): WizardStep {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return 1;
}

function validateStep(step: WizardStep, draft: RunDraft): boolean {
  if (step === 1) return !!draft.bundleId && draft.categories.length >= 1;
  if (step === 2) return draft.candidateIds.length >= 1 && draft.candidateIds.length <= 8;
  if (step === 3) return draft.judgePoolIds.length >= 3 && draft.judgePoolIds.length <= 12;
  return true;
}

/** Client wizard shell — steps, draft persistence, launch (plans/09 §1). */
export function RunWizard({
  bundles,
  maxTokenByBundle,
  models,
  settings,
  isDemo,
}: RunWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = parseStep(searchParams.get("step"));

  const [draft, setDraft] = useState<RunDraft>(() =>
    defaultRunDraft({
      bundleId: bundles[0]?.id ?? null,
      trials: settings.trials,
      candidateConcurrency: settings.candidateConcurrency,
      budgetUsd: settings.defaultBudgetUsd,
    }),
  );
  const [maxReached, setMaxReached] = useState<WizardStep>(1);
  const [hydrated, setHydrated] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Restore draft + ?candidates= deep link once on mount
  useEffect(() => {
    const saved = loadRunDraft();
    const candidatesParam = searchParams.get("candidates");
    const fromQuery = candidatesParam
      ? candidatesParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8)
      : [];

    setDraft((prev) => {
      const base = saved ?? prev;
      const bundleId =
        base.bundleId && bundles.some((b) => b.id === base.bundleId)
          ? base.bundleId
          : (bundles[0]?.id ?? null);
      return {
        ...base,
        bundleId,
        trials: base.trials || settings.trials,
        candidateConcurrency: base.candidateConcurrency || settings.candidateConcurrency,
        budgetUsd: base.budgetUsd || settings.defaultBudgetUsd,
        candidateIds: fromQuery.length > 0 ? fromQuery : base.candidateIds,
      };
    });
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist draft
  useEffect(() => {
    if (!hydrated) return;
    saveRunDraft(draft);
  }, [draft, hydrated]);

  // Ensure idempotency key when entering review
  useEffect(() => {
    if (step === 4 && !draft.idempotencyKey) {
      setDraft((d) => ({ ...d, idempotencyKey: newIdempotencyKey() }));
    }
  }, [step, draft.idempotencyKey]);

  // Expand maxReached as validation allows
  useEffect(() => {
    setMaxReached((m) => (step > m && validateStep(step, draft) ? step : m));
    // Also allow advancing max when current validates
    if (validateStep(step, draft) && step >= maxReached) {
      setMaxReached(step);
    }
  }, [step, draft, maxReached]);

  const setStep = useCallback(
    (s: WizardStep) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("step", String(s));
      router.replace(`/run?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const patch = useCallback((p: Partial<RunDraft>) => {
    setDraft((d) => ({ ...d, ...p }));
  }, []);

  const footerSummary = useMemo(() => {
    if (step === 1) {
      return `${draft.categories.length} categories selected`;
    }
    if (step === 2) {
      return `${draft.candidateIds.length} candidate${draft.candidateIds.length === 1 ? "" : "s"} selected`;
    }
    if (step === 3) {
      return `${draft.judgePoolIds.length} judges in pool`;
    }
    const tasks =
      draft.candidateIds.length * draft.categories.length * draft.trials;
    return `${tasks} tasks · cap ${draft.budgetUsd.toFixed(2)}`;
  }, [step, draft]);

  const canContinue = validateStep(step, draft);

  const goNext = () => {
    if (!canContinue || step >= 4) return;
    const next = (step + 1) as WizardStep;
    setMaxReached((m) => (next > m ? next : m));
    setStep(next);
  };

  const goBack = () => {
    if (step <= 1) return;
    setStep((step - 1) as WizardStep);
  };

  const launch = async (seed: number) => {
    if (!draft.bundleId || launching) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const res = await fetch("/api/runs", {
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
          seed,
          idempotency_key: draft.idempotencyKey ?? newIdempotencyKey(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `Launch failed (HTTP ${res.status})`);
      }
      const data = (await res.json()) as { run_id: string };
      clearRunDraft();
      router.push(`/runs/${encodeURIComponent(data.run_id)}`);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Launch failed");
      setLaunching(false);
    }
  };

  const bundleLabel =
    bundles.find((b) => b.id === draft.bundleId)?.slug ?? "bundle";
  const maxToken = draft.bundleId ? (maxTokenByBundle[draft.bundleId] ?? 0) : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8 md:px-10">
      <h1
        className="font-display text-2xl uppercase tracking-[0.08em] text-bright"
        data-testid="step-heading"
      >
        Configure run
      </h1>

      {isDemo && (
        <DemoBanner
          className="mt-4"
          note="Demo catalog — launch still hits the real API (needs a key)."
        />
      )}

      <div className="mt-6">
        <WizardStepper step={step} maxReached={maxReached} onStep={setStep} />
      </div>

      <div className="mt-8 flex-1 pb-28">
        {step === 1 && (
          <StepBundle
            bundles={bundles}
            bundleId={draft.bundleId}
            categories={draft.categories}
            onBundle={(id) => patch({ bundleId: id })}
            onCategories={(categories) => patch({ categories })}
          />
        )}
        {step === 2 && (
          <StepCandidates
            models={models}
            selectedIds={draft.candidateIds}
            onChange={(candidateIds) => patch({ candidateIds })}
            maxTokenLimit={maxToken}
            catalogEmpty={models.length === 0}
          />
        )}
        {step === 3 && (
          <StepJudgePool
            models={models}
            selectedIds={draft.judgePoolIds}
            candidateIds={draft.candidateIds}
            onChange={(judgePoolIds) => patch({ judgePoolIds })}
            catalogEmpty={models.length === 0}
          />
        )}
        {step === 4 && (
          <StepReview
            draft={draft}
            bundleLabel={bundleLabel}
            onDraftPatch={patch}
            onGotoStep={setStep}
            onLaunch={(seed) => void launch(seed)}
            launching={launching}
          />
        )}

        {launchError && (
          <p role="alert" className="mt-4 text-sm text-fail-400">
            {launchError}
          </p>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 border-t border-line-subtle bg-ink-950/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between md:px-10">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={step === 1}
            className="w-full sm:w-auto"
          >
            ← Back
          </Button>
          <p className="order-first text-center font-mono text-xs text-dim sm:order-none">
            {footerSummary}
          </p>
          {step < 4 ? (
            <Button
              variant="primary"
              onClick={goNext}
              disabled={!canContinue}
              className="w-full sm:w-auto"
            >
              Continue →
            </Button>
          ) : (
            <span className="hidden sm:block sm:w-24" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Visited-step screen-reader hint */}
      <span className="sr-only">
        {WIZARD_STEPS.map((s) => s.label).join(", ")}
      </span>
    </div>
  );
}
