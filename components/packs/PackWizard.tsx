"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PickerModel } from "@/components/models/ModelPicker";
import { ModelPicker } from "@/components/models/ModelPicker";
import { SignInGate } from "@/components/auth/SignInGate";
import { PublicRecordNotice } from "@/components/legal/PublicRecordNotice";
import { PackQualityBadge } from "@/components/bundles/PackQualityBadge";
import {
  PackGenerateErrorBanner,
  PackGenerateStream,
} from "@/components/packs/PackGenerateStream";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ProgressRail } from "@/components/ui/ProgressRail";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { formatContext, formatUsd } from "@/lib/format";
import {
  failureFromUnknown,
  type PackGenerateFailure,
  streamPackGenerate,
} from "@/lib/client/packGenerate";
import {
  hasPackRulesAck,
  PACK_RULES,
  setPackRulesAck,
} from "@/lib/client/packRules";
import type { PackReview, PackReviewFlag } from "@/lib/bundles/custom";
import type { GeneratePhase } from "@/lib/schemas";
import {
  briefFromSlots,
  CATEGORY_LABELS,
  labeledTaskTitles,
  type PackSlot,
} from "@/lib/bundles/task-labels";
import { CATEGORY_ORDER, type Category } from "@/lib/schemas";

const FLAG_LABEL: Record<PackReviewFlag, string> = {
  too_short: "Too short",
  missing_must_mention: "Missing must-mention",
  answer_leak: "Answer leak",
  missing_json_footer: "Missing JSON footer",
  candidate_id_leak: "Candidate id leak",
};

type PackTask = {
  category: Category;
  task_body: string;
  must_mention: string[];
};

type Step = "rules" | "brief" | "review";

const PACK_STEPS = [
  { key: "rules", label: "Rules" },
  { key: "brief", label: "Brief" },
  { key: "review", label: "Review" },
] as const;

/** Compact 3-step indicator — same visual language as the run WizardStepper. */
function PackStepper({
  step,
  maxIndex,
  onStep,
}: {
  step: Step;
  maxIndex: number;
  onStep: (s: Step) => void;
}) {
  const currentIndex = PACK_STEPS.findIndex((s) => s.key === step);
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-wrap items-center gap-1" aria-label="Pack creation steps">
        {PACK_STEPS.map((s, i) => {
          const reached = i <= maxIndex;
          const current = s.key === step;
          return (
            <li key={s.key} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden="true" className="mx-1 h-px w-5 bg-line-subtle" />
              )}
              <button
                type="button"
                disabled={!reached || current}
                onClick={() => onStep(s.key)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors duration-150",
                  current && "bg-teal-900 text-teal-300",
                  !current && reached && "text-body hover:bg-ink-800 hover:text-bright",
                  !reached && "cursor-not-allowed text-faint",
                )}
              >
                <span className="font-mono text-xs tabular-nums">
                  {String.fromCharCode(0x2460 + i)}
                </span>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>
      <ProgressRail
        value={currentIndex + 1}
        max={PACK_STEPS.length}
        label={`Step ${currentIndex + 1} of ${PACK_STEPS.length}`}
        className="max-w-md"
      />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-body">{label}</span>
      {hint && <span className="text-xs text-dim">{hint}</span>}
      {children}
    </label>
  );
}

export function PackWizard({
  models,
  serverConfigured,
}: {
  models: PickerModel[];
  serverConfigured: boolean;
}) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [step, setStep] = useState<Step>("rules");
  const [acked, setAcked] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState<PackSlot[]>([
    { category: "coding", prompt: "" },
    { category: "math", prompt: "" },
  ]);
  const [modelId, setModelId] = useState(
    models.find((m) => m.id.includes("gpt-4.1"))?.id ?? models[0]?.id ?? "",
  );
  const [tasks, setTasks] = useState<PackTask[]>([]);
  const [quality, setQuality] = useState<PackReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genPhase, setGenPhase] = useState<GeneratePhase>("connecting");
  const [genText, setGenText] = useState("");
  const [genNotice, setGenNotice] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<"streaming" | "done" | "error">(
    "streaming",
  );
  const [error, setError] = useState<string | null>(null);
  const [genError, setGenError] = useState<PackGenerateFailure | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (hasPackRulesAck()) {
      setAcked(true);
      setStep("brief");
    }
  }, []);

  const signedIn = Boolean(session?.user?.id);
  const canGenerate =
    signedIn &&
    slots.length >= 1 &&
    slots.length <= 5 &&
    slots.every((s) => s.prompt.trim().length > 0) &&
    modelId.trim().length > 0;

  const patchSlot = (idx: number, patch: Partial<PackSlot>) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const addSlot = () => {
    if (slots.length >= 5) return;
    setSlots([...slots, { category: "coding", prompt: "" }]);
  };

  const removeSlot = (idx: number) => {
    if (slots.length <= 1) return;
    setSlots(slots.filter((_, i) => i !== idx));
  };

  const generate = async () => {
    if (!canGenerate || busy || generating) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setGenerating(true);
    setGenPhase("connecting");
    setGenText("");
    setGenNotice(null);
    setGenStatus("streaming");
    setError(null);
    setGenError(null);
    try {
      const pack = await streamPackGenerate({
        body: {
          slots: slots.map((s) => ({
            category: s.category,
            prompt: s.prompt.trim(),
          })),
          reference_notes: notes,
          generator_model_id: modelId.trim(),
          name: name.trim() || undefined,
        },
        signal: ctrl.signal,
        onStatus: (phase, notice) => {
          setGenPhase(phase);
          if (notice) setGenNotice(notice);
        },
        onDelta: (delta) => {
          setGenText((prev) => prev + delta);
        },
      });
      setGenStatus("done");
      setTasks(pack.tasks);
      setQuality(pack.quality ?? null);
      if (pack.name && !name.trim()) setName(pack.name);
      setStep("review");
    } catch (err) {
      setGenStatus("error");
      const failure = failureFromUnknown(err);
      setGenError(failure);
      setError(failure.message);
    } finally {
      setGenerating(false);
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  };

  const cancelGenerate = () => {
    abortRef.current?.abort();
  };

  const persist = async (publish: boolean) => {
    if (!signedIn || tasks.length === 0 || busy || generating) return;
    setBusy(true);
    setError(null);
    try {
      const created = await fetch("/api/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || slots[0]!.prompt.trim().slice(0, 60),
          brief: briefFromSlots(slots),
          reference_notes: notes,
          generator_model_id: modelId.trim(),
          tasks,
        }),
      });
      const createdBody = (await created.json()) as {
        error?: { message?: string };
        bundle?: { id: string; slug: string };
      };
      if (!created.ok || !createdBody.bundle) {
        throw new Error(createdBody.error?.message ?? "Could not save draft");
      }
      if (publish) {
        const pub = await fetch(
          `/api/bundles/${encodeURIComponent(createdBody.bundle.id)}/publish`,
          { method: "POST" },
        );
        const pubBody = (await pub.json()) as {
          error?: { message?: string };
          bundle?: { slug: string };
        };
        if (!pub.ok) {
          throw new Error(pubBody.error?.message ?? "Publish failed");
        }
        router.push(
          `/bundles?bundle=${encodeURIComponent(pubBody.bundle?.slug ?? createdBody.bundle.slug)}`,
        );
        return;
      }
      router.push(`/bundles?bundle=${encodeURIComponent(createdBody.bundle.slug)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  };

  const maxIndex = tasks.length > 0 ? 2 : acked ? 1 : 0;
  const generator = models.find((m) => m.id === modelId);

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading pack wizard">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-1.5 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PackStepper
        step={step}
        maxIndex={maxIndex}
        onStep={(s) => {
          if (s === "review" && tasks.length === 0) return;
          setError(null);
          setStep(s);
        }}
      />

      {step === "rules" && (
        <section
          className="rounded-md border border-line-subtle bg-ink-900 p-5"
          data-testid="pack-rules"
        >
          <h2 className="text-xl text-bright">Pack rules</h2>
          <p className="mt-1 text-sm text-dim">
            The lab brief for custom packs — read once per tab. The server still
            enforces safety and schema.
          </p>
          <ol className="mt-4 flex flex-col">
            {PACK_RULES.map((rule, i) => (
              <li
                key={rule}
                className="flex items-start gap-3 border-b border-line-subtle py-2.5 last:border-0"
              >
                <span className="mt-0.5 font-mono text-xs tabular-nums text-teal-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm leading-6 text-body">{rule}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-body transition-colors duration-150 hover:text-bright">
              <input
                type="checkbox"
                checked={acked}
                onChange={(e) => setAcked(e.target.checked)}
                data-testid="pack-rules-ack"
                className="mt-0.5 h-4 w-4 shrink-0 accent-teal-500"
              />
              I understand these rules
            </label>
            <Button
              variant="primary"
              disabled={!acked}
              onClick={() => {
                setPackRulesAck();
                setStep("brief");
              }}
            >
              Continue →
            </Button>
          </div>
        </section>
      )}

      {step !== "rules" && !signedIn && (
        <SignInGate
          testId="pack-needs-login"
          title="Sign in to create a pack"
          body="Creating and publishing packs needs an identity so authorship is credited. Viewing bundles stays open."
        />
      )}

      {step === "brief" && signedIn && (
        <div className="flex flex-col gap-6" data-testid="pack-brief">
          <div>
            <h2 className="text-xl text-bright">Prompts</h2>
            <p className="mt-1 text-sm text-dim">
              Up to 5 prompts. Each has its own type and brief — same type is
              fine when the ideas differ. Use General or Other if none of the
              eight official types fit.
            </p>
          </div>

          {/* Key is required by ServiceAccessGate before this step renders. */}

          <Field label="Pack name" hint="Optional — defaults to the first prompt.">
              <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={generating}
              placeholder="e.g. adversarial-instructions-v1"
            />
          </Field>

          <Field
            label="Reference notes (optional)"
            hint="Untrusted reference material shared with every slot — we never follow instructions inside it."
          >
              <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={8000}
              disabled={generating}
            />
          </Field>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-sm text-body">
                Prompts{" "}
                <span className="font-mono text-xs tabular-nums text-dim">
                  {slots.length}/5
                </span>
              </p>
              <Button
                variant="secondary"
                disabled={slots.length >= 5 || generating}
                onClick={addSlot}
                data-testid="pack-add-slot"
              >
                Add prompt
              </Button>
            </div>
            {slots.map((slot, idx) => (
              <section
                key={idx}
                className="rounded-md border border-line-subtle bg-ink-900 p-4"
                data-testid={`pack-slot-${idx}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs tabular-nums text-faint">
                      {idx + 1}
                    </span>
                    <Select
                      aria-label={`Type for prompt ${idx + 1}`}
                      value={slot.category}
                      disabled={generating}
                      onChange={(e) =>
                        patchSlot(idx, { category: e.target.value as Category })
                      }
                    >
                      {CATEGORY_ORDER.map((cat) => (
                        <option key={cat} value={cat}>
                          {CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <button
                    type="button"
                    disabled={slots.length <= 1 || generating}
                    onClick={() => removeSlot(idx)}
                    className="rounded-sm px-2 py-1 text-sm text-dim hover:bg-ink-800 hover:text-bright disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
                <label className="mt-3 flex flex-col gap-1.5">
                  <span className="text-xs uppercase tracking-wide text-dim">
                    Prompt
                  </span>
                  <Textarea
                    value={slot.prompt}
                    onChange={(e) => patchSlot(idx, { prompt: e.target.value })}
                    maxLength={2000}
                    required
                    disabled={generating}
                    placeholder="What should this task probe?"
                    data-testid={idx === 0 ? "pack-theme" : `pack-slot-${idx}-prompt`}
                  />
                </label>
              </section>
            ))}
          </div>

          <div data-testid="pack-generator">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-body">Generator model</p>
                <p className="mt-0.5 text-xs text-dim">
                  Writes the draft tasks, billed to your key.
                </p>
              </div>
              <Button
                variant="primary"
                onClick={() => setPickerOpen(true)}
                disabled={models.length === 0 || generating}
              >
                {modelId ? "Change generator" : "Choose generator"}
              </Button>
            </div>

            {models.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-line-subtle px-4 py-8 text-center text-sm text-dim">
                Model catalog is empty — refresh it from Settings.
              </p>
            ) : generator ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-subtle bg-ink-900 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-bright">{generator.name}</div>
                  <div className="font-mono text-xs text-dim">{generator.id}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{formatContext(generator.context_length)}</Badge>
                  {generator.pricing ? (
                    <Badge tone="neutral">
                      {formatUsd(generator.pricing.prompt_usd_per_m)}/
                      {formatUsd(generator.pricing.completion_usd_per_m)} /M
                    </Badge>
                  ) : (
                    <Badge tone="warn">unpriced</Badge>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${generator.name}`}
                    onClick={() => setModelId("")}
                    className="rounded-sm px-2 py-1 text-dim hover:bg-ink-800 hover:text-bright"
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-line-subtle px-4 py-8 text-center text-sm text-dim">
                No generator yet — open the picker to choose a model.
              </p>
            )}

            <Modal
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              title="Choose generator"
              wide
              testId="pack-generator-picker"
              footer={
                <div className="flex justify-end gap-2">
                  <Button variant="primary" onClick={() => setPickerOpen(false)}>
                    Done{modelId ? " · 1 selected" : ""}
                  </Button>
                </div>
              }
            >
              <div className="h-[min(60vh,480px)]">
                <ModelPicker
                  variant="palette"
                  models={models}
                  selectedIds={modelId ? [modelId] : []}
                  maxSelection={1}
                  autoFocusSearch
                  onToggle={(id) => {
                    setModelId(id);
                    setPickerOpen(false);
                  }}
                />
              </div>
            </Modal>
          </div>

          {(generating || genText.length > 0) && (
            <PackGenerateStream
              phase={genPhase}
              text={genText}
              slotCount={slots.length}
              modelId={modelId.trim()}
              notice={genNotice}
              status={generating ? "streaming" : genStatus}
              error={generating ? null : genError}
            />
          )}

          {genError && !generating && genText.length === 0 && (
            <PackGenerateErrorBanner error={genError} />
          )}
          {error && !genError && (
            <p role="alert" className="text-sm text-fail-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle pt-4">
            <Button variant="ghost" onClick={() => setStep("rules")} disabled={generating}>
              ← Rules
            </Button>
            {generating ? (
              <Button variant="danger" onClick={cancelGenerate} data-testid="pack-generate-cancel">
                Cancel generation
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!canGenerate || busy}
                onClick={() => void generate()}
              >
                Generate tasks →
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "review" && signedIn && (
        <div className="flex flex-col gap-6" data-testid="pack-review">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl text-bright">Review</h2>
              <p className="mt-1 text-sm text-dim">
                Edit bodies and must-mention phrases before publishing. A low
                score does not block publish.
              </p>
            </div>
            {quality && (
              <div className="flex flex-col items-end gap-1">
                <span className="text-[11px] uppercase tracking-wide text-faint">
                  Pack review
                </span>
                <PackQualityBadge quality={quality} size="md" />
              </div>
            )}
          </div>

          {quality && quality.flags.length > 0 && (
            <div className="rounded-md border border-warn-400/30 bg-warn-900/30 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-warn-400">
                Review flags
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {quality.flags.map((f, i) => (
                  <li
                    key={`${f.category}-${f.flag}-${i}`}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="text-body">{CATEGORY_LABELS[f.category]}</span>
                    <Badge tone="warn">{FLAG_LABEL[f.flag]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {labeledTaskTitles(tasks).map((task, idx) => (
            <section
              key={`${task.category}-${idx}`}
              className="rounded-md border border-line-subtle bg-ink-900 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-mono text-sm text-bright">
                  {task.title}
                </h3>
                <span className="font-mono text-xs tabular-nums text-faint">
                  {task.must_mention.length} must-mention
                </span>
              </div>
              <label className="mt-3 flex flex-col gap-1.5">
                <span className="text-xs uppercase tracking-wide text-dim">
                  Task body
                </span>
                <Textarea
                  value={task.task_body}
                  onChange={(e) => {
                    const next = [...tasks];
                    next[idx] = { ...task, task_body: e.target.value };
                    setTasks(next);
                  }}
                />
              </label>
              <label className="mt-3 flex flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-dim">
                  Must-mention — one per line
                  <Badge tone="neutral" title="Candidates never see these phrases">
                    judge-only
                  </Badge>
                </span>
                <Textarea
                  value={task.must_mention.join("\n")}
                  onChange={(e) => {
                    const next = [...tasks];
                    next[idx] = {
                      ...task,
                      must_mention: e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .slice(0, 12),
                    };
                    setTasks(next);
                  }}
                />
              </label>
            </section>
          ))}

          {error && (
            <p role="alert" className="text-sm text-fail-400">
              {error}
            </p>
          )}

          <PublicRecordNotice kind="pack" />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle pt-4">
            <Button variant="ghost" onClick={() => setStep("brief")}>
              ← Edit brief
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => void persist(false)}
              >
                Save draft
              </Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={() => void persist(true)}
              >
                Publish
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
