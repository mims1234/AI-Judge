"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  apiFetch,
  clearStoredApiKey,
  getStoredApiKey,
  maskApiKey,
  setStoredApiKey,
} from "@/lib/client/apiKey";
import { formatLatency, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusDot } from "@/components/ui/StatusDot";

export type ApiKeyStatus = {
  serverConfigured: boolean;
  envFallbackAllowed: boolean;
};

type TestResult = {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  usage_usd?: number | null;
  limit_usd?: number | null;
  limit_remaining?: number | null;
  label?: string | null;
} | null;

/** OpenRouter BYOK — browser localStorage + optional dev env fallback. */
export function ApiKeyCard({ status }: { status: ApiKeyStatus }) {
  const [draft, setDraft] = useState("");
  const [browserKey, setBrowserKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TestResult>(null);

  useEffect(() => {
    setBrowserKey(getStoredApiKey());
    setHydrated(true);
  }, []);

  const browserConfigured = !!browserKey;
  const hasAnyKey = browserConfigured || status.serverConfigured;
  const sourceLabel = browserConfigured
    ? "Your key (stored in this browser)"
    : status.serverConfigured
      ? "Server key"
      : null;
  const maskedTail = browserConfigured ? maskApiKey(browserKey) : null;

  const testConnection = async (keyOverride?: string) => {
    setTesting(true);
    setResult(null);
    try {
      const headers: HeadersInit = {};
      const key = keyOverride?.trim() || getStoredApiKey();
      if (key) headers["x-openrouter-key"] = key;
      const res = await apiFetch("/api/settings/test-key", {
        method: "POST",
        headers,
      });
      setResult((await res.json()) as NonNullable<TestResult>);
    } catch {
      setResult({ ok: false, error: "Request failed — is the server running?" });
    } finally {
      setTesting(false);
    }
  };

  const saveKey = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving(true);
    setResult(null);
    try {
      // Validate before persisting so a bad paste doesn't stick.
      const res = await apiFetch("/api/settings/test-key", {
        method: "POST",
        headers: { "x-openrouter-key": trimmed },
      });
      const json = (await res.json()) as NonNullable<TestResult>;
      setResult(json);
      if (json.ok) {
        setStoredApiKey(trimmed);
        setBrowserKey(trimmed);
        setDraft("");
      }
    } catch {
      setResult({ ok: false, error: "Request failed — is the server running?" });
    } finally {
      setSaving(false);
    }
  };

  const removeKey = () => {
    clearStoredApiKey();
    setBrowserKey(null);
    setDraft("");
    setResult(null);
  };

  return (
    <section
      aria-labelledby="api-key-heading"
      className={cn(
        "rounded-md border bg-ink-900 p-5",
        hasAnyKey ? "border-line-subtle" : "border-warn-400/40",
      )}
    >
      <h2 id="api-key-heading" className="text-xs uppercase tracking-wide text-dim">
        API key
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <StatusDot tone={hasAnyKey ? "done" : "warn"} />
        {hydrated && hasAnyKey ? (
          <span className="text-sm text-body">
            Configured{" "}
            {maskedTail && (
              <span className="font-mono text-dim">
                (…{maskedTail} — last 4 only)
              </span>
            )}
          </span>
        ) : hydrated ? (
          <span className="text-sm text-warn-400">Not configured</span>
        ) : (
          <span className="text-sm text-dim">Checking…</span>
        )}
        {sourceLabel && (
          <Badge tone={browserConfigured ? "teal" : "neutral"}>{sourceLabel}</Badge>
        )}
      </div>

      <p className="mt-3 text-sm text-body">
        Your key lives in this browser — never in our database, on disk, in
        your session, or in logs.
      </p>
      <p className="mt-1.5 text-sm leading-6 text-dim">
        When you launch a run or generate a bundle, this server receives the key
        to call OpenRouter and holds it in process memory for that job only.
        Discord never sees it. Get a key at{" "}
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal-300 underline-offset-2 hover:underline"
        >
          openrouter.ai/keys
        </a>
        .
      </p>

      {status.envFallbackAllowed && status.serverConfigured && !browserConfigured && (
        <p className="mt-2 text-sm leading-6 text-dim">
          A server key is available for local development. Paste your own key
          below to use it instead.
        </p>
      )}

      {!hasAnyKey && (
        <div className="mt-3 rounded-md border border-warn-400/30 bg-warn-900/40 p-3">
          <p className="text-sm text-warn-400">
            Paste an OpenRouter key below to unlock runs, preflight, and catalog
            refresh.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-dim">
            {browserConfigured ? "Replace key" : "OpenRouter API key"}
          </span>
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-or-v1-…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="OpenRouter API key"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void saveKey()}
            loading={saving}
            disabled={!draft.trim()}
          >
            Save key
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void testConnection(draft.trim() || undefined)}
            loading={testing}
            disabled={!draft.trim() && !hasAnyKey}
          >
            Test connection
          </Button>
          {browserConfigured && (
            <Button variant="ghost" size="sm" onClick={removeKey}>
              Remove
            </Button>
          )}
          {result && (
            <span role="status" className="flex items-center gap-2 text-sm">
              <StatusDot tone={result.ok ? "done" : "error"} />
              {result.ok ? (
                <span className="text-pass-400">
                  Connected
                  {result.latencyMs != null && ` · ${formatLatency(result.latencyMs)}`}
                </span>
              ) : (
                <span className="text-fail-400">
                  {result.error ?? "Connection failed"}
                </span>
              )}
            </span>
          )}
        </div>

        {result?.ok &&
          (result.usage_usd != null ||
            result.limit_usd != null ||
            result.limit_remaining != null ||
            result.label) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {result.label && <Badge title="Key label">{result.label}</Badge>}
              {result.usage_usd != null && (
                <Badge title="Total billed usage on this key">
                  used {formatUsd(result.usage_usd)}
                </Badge>
              )}
              {result.limit_usd != null && (
                <Badge title="Credit limit on this key">
                  limit {formatUsd(result.limit_usd)}
                </Badge>
              )}
              {result.limit_remaining != null && (
                <Badge
                  tone={result.limit_remaining > 0 ? "teal" : "warn"}
                  title="Credit remaining on this key"
                >
                  remaining {formatUsd(result.limit_remaining)}
                </Badge>
              )}
            </div>
          )}
      </div>
    </section>
  );
}
