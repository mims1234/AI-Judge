"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatLatency } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/StatusDot";

export type ApiKeyStatus = {
  configured: boolean;
  maskedTail: string | null;
};

type TestResult = { ok: boolean; latencyMs?: number; error?: string } | null;

/** OpenRouter key status + server-side test connection (plans/08 §4.2). */
export function ApiKeyCard({ status }: { status: ApiKeyStatus }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult>(null);

  const testConnection = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/settings/test-key", { method: "POST" });
      setResult((await res.json()) as NonNullable<TestResult>);
    } catch {
      setResult({ ok: false, error: "Request failed — is the server running?" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section
      aria-labelledby="api-key-heading"
      className={cn(
        "rounded-md border bg-ink-900 p-5",
        status.configured ? "border-line-subtle" : "border-fail-400/40",
      )}
    >
      <h2 id="api-key-heading" className="text-xs uppercase tracking-wide text-dim">
        API key
      </h2>

      <div className="mt-3 flex items-center gap-2.5">
        <StatusDot tone={status.configured ? "done" : "error"} />
        {status.configured ? (
          <span className="text-sm text-body">
            Configured{" "}
            <span className="font-mono text-dim">(sk-or-…{status.maskedTail} — last 4 only)</span>
          </span>
        ) : (
          <span className="text-sm text-fail-400">Not configured</span>
        )}
      </div>

      <p className="mt-2 text-sm leading-6 text-dim">
        Read from <code className="font-mono text-body">OPENROUTER_API_KEY</code> in{" "}
        <code className="font-mono text-body">.env.local</code>. Never stored or displayed by
        this app.
      </p>

      {!status.configured && (
        <div className="mt-3 rounded-md border border-fail-400/30 bg-fail-900 p-3">
          <p className="text-sm text-fail-400">
            Add your key to <code className="font-mono">.env.local</code> and restart the dev
            server:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-sm bg-ink-950 p-2 font-mono text-xs text-body">
            OPENROUTER_API_KEY=sk-or-…
          </pre>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={testConnection}
          loading={testing}
          disabled={!status.configured}
        >
          Test connection
        </Button>
        {result && (
          <span role="status" className="flex items-center gap-2 text-sm">
            <StatusDot tone={result.ok ? "done" : "error"} />
            {result.ok ? (
              <span className="text-pass-400">
                Connected{result.latencyMs != null && ` · ${formatLatency(result.latencyMs)}`}
              </span>
            ) : (
              <span className="text-fail-400">{result.error ?? "Connection failed"}</span>
            )}
          </span>
        )}
      </div>
    </section>
  );
}
