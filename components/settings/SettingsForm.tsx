"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { AppSettingsSchema, type AppSettings } from "@/lib/settings";
import { useAnnounce } from "@/components/ui/StatusAnnouncer";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

type FieldKey = keyof AppSettings;

const FIELD_LABELS: Record<FieldKey, string> = {
  candidateConcurrency: "Candidate concurrency",
  judgeConcurrency: "Judge concurrency",
  trials: "Trials per task",
  defaultBudgetUsd: "Default budget cap",
  timeoutSec: "Request timeout",
  maxRetries: "Max retries",
};

function Field({
  label,
  error,
  helper,
  children,
}: {
  label: string;
  error?: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-body">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-xs text-fail-400">
          {error}
        </span>
      ) : helper ? (
        <span className="text-xs text-faint">{helper}</span>
      ) : null}
    </label>
  );
}

/** Zod-validated operator defaults, persisted via PUT /api/settings (plans/08 §4.2). */
export function SettingsForm({ initial }: { initial: AppSettings }) {
  const [values, setValues] = useState<AppSettings>(initial);
  const [baseline, setBaseline] = useState<AppSettings>(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const announce = useAnnounce();

  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(baseline), [values, baseline]);

  const set = <K extends FieldKey>(key: K, value: AppSettings[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setSaved(false);
  };

  const save = async () => {
    const parsed = AppSettingsSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldKey | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSaving(true);
    setSaveFailed(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const savedSettings = (await res.json()) as AppSettings;
      setBaseline(savedSettings);
      setValues(savedSettings);
      setSaved(true);
      announce("Settings saved");
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="run-defaults-heading" className="rounded-md border border-line-subtle bg-ink-900 p-5">
      <h2 id="run-defaults-heading" className="text-xs uppercase tracking-wide text-dim">
        Run defaults
      </h2>
      <p className="mt-1 text-sm text-dim">These prefill the run wizard.</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={FIELD_LABELS.candidateConcurrency} error={errors.candidateConcurrency}>
          <Select
            value={values.candidateConcurrency}
            onChange={(e) => set("candidateConcurrency", Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </Field>

        <Field label={FIELD_LABELS.judgeConcurrency} error={errors.judgeConcurrency}>
          <Select
            value={values.judgeConcurrency}
            onChange={(e) => set("judgeConcurrency", Number(e.target.value))}
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </Field>

        <Field label={FIELD_LABELS.trials} error={errors.trials} helper="recommended: 3">
          <Select value={values.trials} onChange={(e) => set("trials", Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </Field>

        <Field label={FIELD_LABELS.defaultBudgetUsd} error={errors.defaultBudgetUsd} helper="$0.10 – $100">
          <span className="relative">
            <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-dim">$</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0.1}
              max={100}
              step={0.1}
              value={values.defaultBudgetUsd}
              onChange={(e) => set("defaultBudgetUsd", e.target.valueAsNumber || 0)}
              className="pl-7"
              aria-invalid={!!errors.defaultBudgetUsd}
            />
          </span>
        </Field>

        <Field label={FIELD_LABELS.timeoutSec} error={errors.timeoutSec} helper="30 – 600 seconds">
          <Input
            type="number"
            inputMode="numeric"
            min={30}
            max={600}
            step={10}
            value={values.timeoutSec}
            onChange={(e) => set("timeoutSec", e.target.valueAsNumber || 0)}
            aria-invalid={!!errors.timeoutSec}
          />
        </Field>

        <Field label={FIELD_LABELS.maxRetries} error={errors.maxRetries} helper="0 – 5">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={5}
            step={1}
            value={values.maxRetries}
            onChange={(e) => set("maxRetries", e.target.valueAsNumber || 0)}
            aria-invalid={!!errors.maxRetries}
          />
        </Field>
      </div>

      {saveFailed && (
        <div role="alert" className="mt-4 rounded-md border border-fail-400/30 bg-fail-900 px-3 py-2 text-sm text-fail-400">
          Could not save — retry.
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <Button
          variant="primary"
          onClick={save}
          loading={saving}
          disabled={!dirty}
          className={cn(dirty && !saving && "ring-1 ring-teal-400/50")}
        >
          Save defaults
        </Button>
        {saved && !dirty && (
          <span role="status" className="text-sm text-pass-400">
            ✓ Saved
          </span>
        )}
      </div>
    </section>
  );
}
