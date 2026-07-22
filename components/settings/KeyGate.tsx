"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  API_KEY_CHANGED_EVENT,
  apiFetch,
  hasStoredApiKey,
  setStoredApiKey,
} from "@/lib/client/apiKey";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

export type KeyGateProps = {
  /** When true, server has a usable env key (dev) — hide the gate. */
  serverConfigured: boolean;
  /** Compact banner instead of modal (e.g. run wizard). */
  variant?: "banner" | "modal";
  /** Force open (e.g. after a NEEDS_KEY 401). */
  forceOpen?: boolean;
  onDismiss?: () => void;
  onKeySaved?: () => void;
};

/**
 * Onboarding gate when no browser key and no dev env fallback.
 * Explains BYOK, links to openrouter.ai/keys, inline paste-and-test.
 */
export function KeyGate({
  serverConfigured,
  variant = "banner",
  forceOpen = false,
  onDismiss,
  onKeySaved,
}: KeyGateProps) {
  const [hasBrowserKey, setHasBrowserKey] = useState(true); // avoid flash
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const sync = () => setHasBrowserKey(hasStoredApiKey());
    sync();
    setHydrated(true);
    window.addEventListener(API_KEY_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(API_KEY_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (forceOpen && !serverConfigured && !hasBrowserKey) {
      setModalOpen(true);
    }
  }, [forceOpen, serverConfigured, hasBrowserKey]);

  const needsKey = hydrated && !serverConfigured && !hasBrowserKey;
  if (!needsKey && !forceOpen) return null;
  if (!needsKey && forceOpen && hasBrowserKey) return null;

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/settings/test-key", {
        method: "POST",
        headers: { "x-openrouter-key": trimmed },
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Key rejected");
        return;
      }
      setStoredApiKey(trimmed);
      setDraft("");
      setModalOpen(false);
      onKeySaved?.();
      onDismiss?.();
    } catch {
      setError("Could not reach the server — is it running?");
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-6 text-dim">
        AI Judge bills through{" "}
        <strong className="text-body">your</strong> OpenRouter account. Create a
        key at{" "}
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal-300 underline-offset-2 hover:underline"
        >
          openrouter.ai/keys
        </a>
        , paste it here, and we&apos;ll store it only in this browser.
      </p>
      <Input
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="sk-or-v1-…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="OpenRouter API key"
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-fail-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={!draft.trim()}
          onClick={() => void save()}
        >
          Save &amp; continue
        </Button>
        <Link
          href="/settings"
          className="text-sm text-teal-300 underline-offset-2 hover:underline"
        >
          Open Settings
        </Link>
      </div>
    </div>
  );

  if (variant === "modal") {
    return (
      <Modal
        open={modalOpen || (forceOpen && needsKey)}
        onClose={() => {
          setModalOpen(false);
          onDismiss?.();
        }}
        title="Add your OpenRouter API key"
        testId="key-gate-modal"
      >
        {form}
      </Modal>
    );
  }

  return (
    <div
      role="region"
      aria-label="API key required"
      data-testid="key-gate-banner"
      className="rounded-md border border-warn-400/40 bg-warn-900/40 px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-warn-400">
            API key required to use AI features
          </p>
          <div className="mt-2">{form}</div>
        </div>
      </div>
    </div>
  );
}
