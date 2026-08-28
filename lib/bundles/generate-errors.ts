import { OpenRouterError } from "@/lib/openrouter";
import type { GeneratePhase } from "@/lib/schemas";

export type GenerateErrorPayload = {
  code: string;
  message: string;
  hint?: string;
  kind?: string;
  status?: number;
  attempts?: number;
  deliveredDeltas?: boolean;
  phase?: GeneratePhase;
  model?: string;
  chars?: number;
};

const SECRET = /sk-or-v1-[A-Za-z0-9_-]+/g;

export function redactSecrets(text: string): string {
  return text.replace(SECRET, "sk-or-v1-…");
}

/** Pull a short, readable cause out of an OpenRouter / proxy body. */
export function sanitizeUpstreamText(raw: string, max = 240): string {
  const trimmed = redactSecrets(raw).trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: {
        message?: string;
        code?: string | number;
        metadata?: { raw?: unknown; provider_name?: string };
      };
      message?: string;
    };
    const parts: string[] = [];
    if (parsed.error?.message) parts.push(parsed.error.message);
    else if (parsed.message) parts.push(parsed.message);
    if (parsed.error?.metadata?.provider_name) {
      parts.push(`provider ${parsed.error.metadata.provider_name}`);
    }
    const rawMeta = parsed.error?.metadata?.raw;
    if (typeof rawMeta === "string") {
      const slice = rawMeta.replace(/\s+/g, " ").trim();
      if (slice && slice.length <= 220) parts.push(slice);
    }
    const joined = parts.filter(Boolean).join(" — ");
    if (joined) return joined.slice(0, max);
  } catch {
    // not JSON
  }
  return trimmed.replace(/\s+/g, " ").slice(0, max);
}

function delivered(err: OpenRouterError): boolean | undefined {
  const extra = err as OpenRouterError & { deliveredDeltas?: boolean };
  return extra.deliveredDeltas;
}

function bodyText(err: OpenRouterError): string {
  const extra = err as OpenRouterError & { bodyText?: string };
  return typeof extra.bodyText === "string" ? extra.bodyText : err.message;
}

export function describeGenerateError(
  err: unknown,
  ctx: { phase: GeneratePhase; model: string; chars?: number },
): GenerateErrorPayload {
  const base = {
    phase: ctx.phase,
    model: ctx.model,
    chars: ctx.chars,
  };

  if (err instanceof OpenRouterError) {
    const cause = sanitizeUpstreamText(bodyText(err));
    const deltas = delivered(err);
    const common = {
      ...base,
      kind: err.kind,
      status: err.status,
      attempts: err.attempts,
      deliveredDeltas: deltas,
    };

    if (err.kind === "aborted") {
      return {
        ...common,
        code: "ABORTED",
        message: deltas
          ? "The OpenRouter stream was aborted while the model was still writing."
          : "The request was aborted before the model sent any tokens.",
        hint: deltas
          ? "Usually a proxy, browser, or page-close timeout — not a bad brief. Try a faster model or fewer prompts."
          : "The page may have been closed, or the host cut the request before connect.",
      };
    }

    if (err.kind === "timeout") {
      const idle = /idle stream watchdog/i.test(err.message);
      const deadline = /deadline/i.test(err.message);
      return {
        ...common,
        code: "TIMEOUT",
        message: idle
          ? err.message
          : deadline
            ? "The generate call hit its deadline."
            : cause || err.message,
        hint: idle
          ? "That model went silent. Retry, or pick a faster generator."
          : "Try a faster model or fewer / shorter prompts.",
      };
    }

    if (err.kind === "auth" || err.kind === "missing_key") {
      return {
        ...common,
        code: "NEEDS_KEY",
        message: cause
          ? `OpenRouter rejected the API key${err.status ? ` (HTTP ${err.status})` : ""}: ${cause}`
          : "OpenRouter rejected the API key.",
        hint: "Paste a valid key in Settings and try again.",
      };
    }

    if (err.kind === "rate_limited") {
      const wait =
        err.retryAfterMs != null
          ? ` Wait about ${Math.max(1, Math.round(err.retryAfterMs / 1000))}s.`
          : "";
      return {
        ...common,
        code: "RATE_LIMITED",
        message: cause
          ? `OpenRouter rate-limited this key${err.status ? ` (HTTP ${err.status})` : ""}: ${cause}`
          : "OpenRouter rate-limited this key.",
        hint: `Wait, then retry.${wait}`,
      };
    }

    if (err.kind === "bad_request") {
      return {
        ...common,
        code: "BAD_REQUEST",
        message: cause
          ? `OpenRouter rejected the generate call${err.status ? ` (HTTP ${err.status})` : ""}: ${cause}`
          : "OpenRouter rejected the generate call.",
        hint: "This model may not support structured bundle output. Try another generator.",
      };
    }

    return {
      ...common,
      code: "UPSTREAM_ERROR",
      message: cause
        ? `OpenRouter / provider failed${err.status ? ` (HTTP ${err.status})` : ""}: ${cause}`
        : err.message,
      hint: "Retry once. If it repeats, switch generator.",
    };
  }

  if (err instanceof Error && err.name === "AbortError") {
    return {
      ...base,
      code: "ABORTED",
      kind: "aborted",
      message: "The generate request was aborted.",
      hint: "The page closed or the host cancelled the request.",
    };
  }

  return {
    ...base,
    code: "INTERNAL_ERROR",
    message: err instanceof Error ? err.message : "Generate failed",
    hint: "Unexpected server error — check the generate route logs.",
  };
}

export function logGenerateError(
  payload: GenerateErrorPayload,
  extra?: { slots?: number },
): void {
  const line = {
    code: payload.code,
    kind: payload.kind,
    status: payload.status,
    phase: payload.phase,
    model: payload.model,
    slots: extra?.slots,
    attempts: payload.attempts,
    deliveredDeltas: payload.deliveredDeltas,
    chars: payload.chars,
    message: payload.message,
  };
  if (payload.code === "INTERNAL_ERROR") {
    console.error("[api] generate", line);
    return;
  }
  console.warn("[api] generate", line);
}
