import { createHash } from "node:crypto";
import { getDb, prepare } from "@/lib/db";
import { isEnvApiKeyFallbackAllowed } from "@/lib/env";
import {
  OpenRouterModelSchema,
  stripNumericBoundsForWire,
} from "@/lib/schemas";

const CACHE_TTL_MS = 60 * 60 * 1000;
const IDLE_WATCHDOG_MS = 90_000;
const DEFAULT_BASE = "https://openrouter.ai/api/v1";

export type KeyStatus =
  | { state: "missing" }
  | { state: "invalid"; message: string }
  | {
      state: "ok";
      label?: string;
      usage_usd?: number;
      limit_usd?: number | null;
    };

export class OpenRouterError extends Error {
  kind:
    | "missing_key"
    | "auth"
    | "rate_limited"
    | "upstream"
    | "timeout"
    | "aborted"
    | "bad_request";
  status?: number;
  attempts: number;
  retryable: boolean;
  /** Parsed Retry-After delay in ms when present on 429 responses. */
  retryAfterMs?: number;

  constructor(
    kind: OpenRouterError["kind"],
    message: string,
    opts?: { status?: number; attempts?: number; retryAfterMs?: number },
  ) {
    super(message);
    this.name = "OpenRouterError";
    this.kind = kind;
    this.status = opts?.status;
    this.attempts = opts?.attempts ?? 1;
    this.retryAfterMs = opts?.retryAfterMs;
    this.retryable =
      kind === "rate_limited" || kind === "upstream" || kind === "timeout";
  }
}

export interface CatalogModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt_usd_per_m: number; completion_usd_per_m: number } | null;
  supports_structured_outputs: boolean;
  is_free: boolean;
}

export interface CatalogResult {
  source: "cache" | "stale" | "network";
  fetched_at: string;
  models: CatalogModel[];
}

export interface StreamChatParams {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature: number;
  maxTokens: number;
  responseFormat?: { name: string; schema: object };
  signal: AbortSignal;
  onDelta: (textDelta: string) => void;
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
  /** Overall deadline ms; default 600_000 candidates / caller sets 240_000 for judges. */
  deadlineMs?: number;
  /** When true, allow retry after partial deltas (judge calls). */
  allowRetryAfterPartial?: boolean;
  /** Explicit OpenRouter key (BYOK). Falls back to env in non-production. */
  apiKey?: string | null;
}

export interface StreamChatResult {
  text: string;
  finish_reason: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number;
  };
  provider: string | null;
  latency_ms: number;
  request_hash: string;
  usage_estimated?: boolean;
  degraded_params?: string[];
}

type GlobalOr = {
  __aiJudgeOrRefresh?: Promise<CatalogResult> | null;
};

const g = globalThis as typeof globalThis & GlobalOr;

function readEnvApiKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || !key.trim()) return null;
  return key.trim();
}

/**
 * Resolve the OpenRouter key for a call.
 * Precedence: explicit user key → env key (only in AI_JUDGE_MODE=dev, or
 * when mode is unset and NODE_ENV !== "production").
 */
export function resolveApiKey(userKey?: string | null): string | null {
  if (userKey && userKey.trim()) return userKey.trim();
  if (isEnvApiKeyFallbackAllowed()) return readEnvApiKey();
  return null;
}

function getBaseUrl(): string {
  // Read at call time so tests can override OPENROUTER_BASE_URL.
  return (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
}

/** True when an env key is available for dev convenience (Settings badge). */
export function hasServerKey(): boolean {
  return isEnvApiKeyFallbackAllowed() && readEnvApiKey() !== null;
}

/** True when a key can be resolved (user and/or non-prod env). */
export function hasApiKey(userKey?: string | null): boolean {
  return resolveApiKey(userKey) !== null;
}

function attributionHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "AI Judge",
    "Content-Type": "application/json",
  };
}

export async function checkKeyStatus(
  userKey?: string | null,
): Promise<KeyStatus> {
  const key = resolveApiKey(userKey);
  if (!key) return { state: "missing" };

  const res = await fetch(`${getBaseUrl()}/auth/key`, {
    headers: attributionHeaders(key),
  });

  if (res.status === 401 || res.status === 403) {
    return {
      state: "invalid",
      message: `status check failed: ${res.status}`,
    };
  }
  if (!res.ok) {
    throw new Error(`couldn't reach OpenRouter: HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: { label?: string; usage?: number; limit?: number | null };
  };
  return {
    state: "ok",
    label: json.data?.label,
    usage_usd: json.data?.usage,
    limit_usd: json.data?.limit ?? null,
  };
}

function normalizePricing(
  pricing: { prompt?: string | number; completion?: string | number } | null | undefined,
): { prompt_usd_per_m: number; completion_usd_per_m: number } | null {
  if (!pricing) return null;
  const prompt = Number(pricing.prompt);
  const completion = Number(pricing.completion);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return null;
  return {
    prompt_usd_per_m: prompt * 1_000_000,
    completion_usd_per_m: completion * 1_000_000,
  };
}

function deriveSupportsStructured(raw: unknown): boolean {
  const params =
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { supported_parameters?: unknown }).supported_parameters)
      ? ((raw as { supported_parameters: string[] }).supported_parameters)
      : [];
  return (
    params.includes("response_format") || params.includes("structured_outputs")
  );
}

function rowToCatalogModel(row: {
  openrouter_id: string;
  name: string;
  context_length: number | null;
  pricing_json: string;
  raw_json: string;
}): CatalogModel {
  let pricing: CatalogModel["pricing"] = null;
  try {
    pricing = JSON.parse(row.pricing_json) as CatalogModel["pricing"];
  } catch {
    pricing = null;
  }
  let raw: unknown = null;
  try {
    raw = JSON.parse(row.raw_json);
  } catch {
    raw = null;
  }
  const is_free =
    pricing != null &&
    pricing.prompt_usd_per_m === 0 &&
    pricing.completion_usd_per_m === 0;

  return {
    id: row.openrouter_id,
    name: row.name,
    context_length: row.context_length ?? 0,
    pricing,
    supports_structured_outputs: deriveSupportsStructured(raw),
    is_free,
  };
}

function readCacheRows(): Array<{
  openrouter_id: string;
  name: string;
  context_length: number | null;
  pricing_json: string;
  raw_json: string;
  fetched_at: number;
}> {
  return prepare(
    `SELECT openrouter_id, name, context_length, pricing_json, raw_json, fetched_at
     FROM models_cache ORDER BY openrouter_id`,
  ).all() as Array<{
    openrouter_id: string;
    name: string;
    context_length: number | null;
    pricing_json: string;
    raw_json: string;
    fetched_at: number;
  }>;
}

function cacheMeta(rows: ReturnType<typeof readCacheRows>): {
  fetched_at: number;
  models: CatalogModel[];
} | null {
  if (rows.length === 0) return null;
  const fetched_at = Math.max(...rows.map((r) => r.fetched_at));
  return { fetched_at, models: rows.map(rowToCatalogModel) };
}

async function fetchAndUpsertCatalog(
  userKey?: string | null,
): Promise<CatalogResult> {
  const key = resolveApiKey(userKey);
  if (!key) {
    throw new OpenRouterError(
      "missing_key",
      "OpenRouter API key is missing — add one in Settings",
    );
  }

  const res = await fetch(`${getBaseUrl()}/models`, {
    headers: attributionHeaders(key),
  });
  if (!res.ok) {
    throw new OpenRouterError(
      res.status === 401 || res.status === 403 ? "auth" : "upstream",
      `OpenRouter /models failed: HTTP ${res.status}`,
      { status: res.status },
    );
  }

  const json = (await res.json()) as { data?: unknown[] };
  const entries = Array.isArray(json.data) ? json.data : [];
  const now = Date.now();
  const models: CatalogModel[] = [];

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO models_cache (openrouter_id, name, context_length, pricing_json, raw_json, fetched_at)
    VALUES (@openrouter_id, @name, @context_length, @pricing_json, @raw_json, @fetched_at)
    ON CONFLICT(openrouter_id) DO UPDATE SET
      name = excluded.name,
      context_length = excluded.context_length,
      pricing_json = excluded.pricing_json,
      raw_json = excluded.raw_json,
      fetched_at = excluded.fetched_at
  `);
  const purge = db.prepare(
    `DELETE FROM models_cache WHERE fetched_at < @fetched_at`,
  );

  const tx = db.transaction(() => {
    for (const entry of entries) {
      const parsed = OpenRouterModelSchema.safeParse(entry);
      if (!parsed.success) {
        console.warn("[openrouter] skipping malformed model entry");
        continue;
      }
      const m = parsed.data;
      const pricing = normalizePricing(m.pricing ?? null);
      const name = m.name ?? m.id;
      const context_length = m.context_length ?? 0;
      upsert.run({
        openrouter_id: m.id,
        name,
        context_length,
        pricing_json: JSON.stringify(pricing),
        raw_json: JSON.stringify(entry),
        fetched_at: now,
      });
      const catalog = rowToCatalogModel({
        openrouter_id: m.id,
        name,
        context_length,
        pricing_json: JSON.stringify(pricing),
        raw_json: JSON.stringify(entry),
      });
      models.push(catalog);
    }
    purge.run({ fetched_at: now });
  });
  tx();

  return {
    source: "network",
    fetched_at: new Date(now).toISOString(),
    models,
  };
}

function startBackgroundRefresh(userKey?: string | null): void {
  if (g.__aiJudgeOrRefresh) return;
  if (!resolveApiKey(userKey)) return;
  g.__aiJudgeOrRefresh = fetchAndUpsertCatalog(userKey)
    .catch((err) => {
      console.warn("[openrouter] background catalog refresh failed", err);
      return null as unknown as CatalogResult;
    })
    .finally(() => {
      g.__aiJudgeOrRefresh = null;
    }) as Promise<CatalogResult>;
}

/**
 * Cached catalog only — never hits the network.
 * Used by RSC pages in production when no server key is available.
 */
export function getCachedCatalog(): CatalogResult | null {
  const meta = cacheMeta(readCacheRows());
  if (!meta) return null;
  const age = Date.now() - meta.fetched_at;
  return {
    source: age < CACHE_TTL_MS ? "cache" : "stale",
    fetched_at: new Date(meta.fetched_at).toISOString(),
    models: meta.models,
  };
}

export async function getModelCatalog(opts?: {
  forceRefresh?: boolean;
  apiKey?: string | null;
}): Promise<CatalogResult> {
  const rows = readCacheRows();
  const meta = cacheMeta(rows);
  const now = Date.now();
  const apiKey = opts?.apiKey;

  if (meta && !opts?.forceRefresh) {
    const age = now - meta.fetched_at;
    if (age < CACHE_TTL_MS) {
      return {
        source: "cache",
        fetched_at: new Date(meta.fetched_at).toISOString(),
        models: meta.models,
      };
    }
    // Stale-while-revalidate (skipped when no resolvable key)
    startBackgroundRefresh(apiKey);
    return {
      source: "stale",
      fetched_at: new Date(meta.fetched_at).toISOString(),
      models: meta.models,
    };
  }

  if (opts?.forceRefresh && meta) {
    try {
      return await fetchAndUpsertCatalog(apiKey);
    } catch {
      return {
        source: "stale",
        fetched_at: new Date(meta.fetched_at).toISOString(),
        models: meta.models,
      };
    }
  }

  // Empty cache — fetch synchronously when a key is available; otherwise fail
  // so callers can fall back to cache-only / EmptyState.
  if (!resolveApiKey(apiKey)) {
    if (meta) {
      return {
        source: "stale",
        fetched_at: new Date(meta.fetched_at).toISOString(),
        models: meta.models,
      };
    }
    throw new OpenRouterError(
      "missing_key",
      "OpenRouter API key is missing — add one in Settings",
    );
  }

  try {
    return await fetchAndUpsertCatalog(apiKey);
  } catch (err) {
    if (meta) {
      return {
        source: "stale",
        fetched_at: new Date(meta.fetched_at).toISOString(),
        models: meta.models,
      };
    }
    if (err instanceof OpenRouterError) throw err;
    throw new OpenRouterError(
      "upstream",
      err instanceof Error ? err.message : "upstream catalog fetch failed",
    );
  }
}

export function getCachedModel(modelId: string): CatalogModel | null {
  const row = prepare(
    `SELECT openrouter_id, name, context_length, pricing_json, raw_json, fetched_at
     FROM models_cache WHERE openrouter_id = ?`,
  ).get(modelId) as
    | {
        openrouter_id: string;
        name: string;
        context_length: number | null;
        pricing_json: string;
        raw_json: string;
        fetched_at: number;
      }
    | undefined;
  if (!row) return null;
  return rowToCatalogModel(row);
}

function requestHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const asInt = Number(header);
  if (Number.isFinite(asInt) && asInt >= 0) {
    // Numeric Retry-After is seconds
    return Math.round(asInt * 1000);
  }
  const when = Date.parse(header);
  if (Number.isFinite(when)) {
    return Math.max(0, when - Date.now());
  }
  return undefined;
}

function classifyHttpError(
  status: number,
  bodyText: string,
  retryAfterMs?: number,
): OpenRouterError {
  if (status === 401 || status === 403) {
    return new OpenRouterError("auth", bodyText || `HTTP ${status}`, {
      status,
    });
  }
  if (status === 429) {
    return new OpenRouterError("rate_limited", bodyText || "rate limited", {
      status,
      retryAfterMs,
    });
  }
  if (status >= 500) {
    return new OpenRouterError("upstream", bodyText || `HTTP ${status}`, {
      status,
    });
  }
  return new OpenRouterError("bad_request", bodyText || `HTTP ${status}`, {
    status,
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new OpenRouterError("aborted", "aborted"));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new OpenRouterError("aborted", "aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function backoffMs(attempt: number, retryAfterMs?: number): number {
  // attempt is 1-indexed retry number
  const base = Math.min(8000, 1000 * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * 500);
  const computed = base + jitter;
  if (retryAfterMs != null) {
    return Math.min(30_000, Math.max(computed, retryAfterMs));
  }
  return computed;
}

async function parseSseStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (d: string) => void,
  signal: AbortSignal,
): Promise<{
  text: string;
  finish_reason: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number | null;
  };
  provider: string | null;
  deliveredDeltas: boolean;
}> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let buffer = "";
  let text = "";
  let finish_reason = "stop";
  let provider: string | null = null;
  let deliveredDeltas = false;
  let usage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: null as number | null,
  };
  let lastByteAt = Date.now();
  let idleTimer: ReturnType<typeof setInterval> | null = null;

  const clearIdle = () => {
    if (idleTimer) clearInterval(idleTimer);
    idleTimer = null;
  };

  idleTimer = setInterval(() => {
    if (Date.now() - lastByteAt > IDLE_WATCHDOG_MS) {
      clearIdle();
      void reader.cancel().catch(() => undefined);
    }
  }, 5_000);

  const processFrame = (frame: string) => {
    const lines = frame.split("\n");
    for (const line of lines) {
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trimStart();
      if (payload === "[DONE]") return;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        console.warn("[openrouter] skipping malformed SSE frame");
        continue;
      }
      if (obj.error && typeof obj.error === "object") {
        const err = obj.error as { code?: string | number; message?: string };
        const code = String(err.code ?? "");
        if (code === "429" || /rate/i.test(code)) {
          throw new OpenRouterError(
            "rate_limited",
            err.message ?? "rate limited mid-stream",
          );
        }
        if (/^5/.test(code)) {
          throw new OpenRouterError(
            "upstream",
            err.message ?? "upstream mid-stream error",
          );
        }
        throw new OpenRouterError(
          "bad_request",
          err.message ?? "bad request mid-stream",
        );
      }
      if (typeof obj.provider === "string") provider = obj.provider;
      const choices = obj.choices as
        | Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>
        | undefined;
      const choice = choices?.[0];
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        text += delta;
        deliveredDeltas = true;
        onDelta(delta);
      }
      if (choice?.finish_reason) {
        finish_reason = choice.finish_reason;
      }
      if (obj.usage && typeof obj.usage === "object") {
        const u = obj.usage as {
          prompt_tokens?: number;
          completion_tokens?: number;
          cost?: number;
        };
        usage = {
          prompt_tokens: u.prompt_tokens ?? usage.prompt_tokens,
          completion_tokens: u.completion_tokens ?? usage.completion_tokens,
          cost_usd: typeof u.cost === "number" ? u.cost : usage.cost_usd,
        };
      }
    }
  };

  try {
    while (true) {
      if (signal.aborted) {
        throw new OpenRouterError("aborted", "aborted");
      }
      const { done, value } = await reader.read();
      if (done) break;
      lastByteAt = Date.now();
      // Normalize CRLF (and bare CR) so frame splits work for \r\n\r\n SSE.
      buffer += decoder
        .decode(value, { stream: true })
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        processFrame(frame);
      }
    }
    if (buffer.trim()) processFrame(buffer);
  } catch (err) {
    const attach = (e: OpenRouterError) => {
      (e as OpenRouterError & { deliveredDeltas?: boolean }).deliveredDeltas =
        deliveredDeltas;
      return e;
    };
    if (err instanceof OpenRouterError) throw attach(err);
    if (signal.aborted) throw attach(new OpenRouterError("aborted", "aborted"));
    if (Date.now() - lastByteAt > IDLE_WATCHDOG_MS) {
      throw attach(
        new OpenRouterError("timeout", "idle stream watchdog (90s)"),
      );
    }
    throw err;
  } finally {
    clearIdle();
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  return { text, finish_reason, usage, provider, deliveredDeltas };
}

async function streamChatOnce(
  params: StreamChatParams,
  opts: {
    stripTemperature?: boolean;
    stripResponseFormat?: boolean;
  } = {},
): Promise<StreamChatResult & { deliveredDeltas: boolean }> {
  const key = resolveApiKey(params.apiKey);
  if (!key) {
    throw new OpenRouterError(
      "missing_key",
      "OpenRouter API key is missing — add one in Settings",
    );
  }

  const degraded: string[] = [];
  const cached = getCachedModel(params.model);
  const supportsStructured = cached?.supports_structured_outputs ?? false;

  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    stream: true,
    max_tokens: params.maxTokens,
    usage: { include: true },
  };

  if (!opts.stripTemperature) {
    body.temperature = params.temperature;
  } else {
    degraded.push("temperature");
  }

  if (
    params.responseFormat &&
    supportsStructured &&
    !opts.stripResponseFormat
  ) {
    // Strip min/max/etc. — Anthropic structured outputs via OpenRouter 400 on
    // those keywords. Ranges remain enforced by local Zod after parse.
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: params.responseFormat.name,
        strict: true,
        schema: stripNumericBoundsForWire(params.responseFormat.schema),
      },
    };
  } else if (params.responseFormat && opts.stripResponseFormat) {
    degraded.push("response_format");
  }

  const hash = requestHash({
    model: params.model,
    messages: params.messages,
    temperature: opts.stripTemperature ? undefined : params.temperature,
    max_tokens: params.maxTokens,
    response_format: body.response_format ?? undefined,
  });

  const deadlineMs = params.deadlineMs ?? 600_000;
  const combined = AbortSignal.any([
    params.signal,
    AbortSignal.timeout(deadlineMs),
  ]);

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: attributionHeaders(key),
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch (err) {
    if (params.signal.aborted || combined.aborted) {
      const name =
        err instanceof Error && err.name === "TimeoutError"
          ? "timeout"
          : "aborted";
      throw new OpenRouterError(
        name === "timeout" ? "timeout" : "aborted",
        name === "timeout" ? "request deadline exceeded" : "aborted",
      );
    }
    throw new OpenRouterError(
      "upstream",
      err instanceof Error ? err.message : "network error",
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
    const err = classifyHttpError(res.status, text, retryAfterMs);
    // Parameter-rejection detection for caller
    (err as OpenRouterError & { bodyText?: string }).bodyText = text;
    throw err;
  }

  if (!res.body) {
    throw new OpenRouterError("upstream", "empty response body");
  }

  let parsed;
  try {
    parsed = await parseSseStream(res.body, params.onDelta, combined);
  } catch (err) {
    if (
      err instanceof OpenRouterError &&
      err.kind === "aborted" &&
      !params.signal.aborted
    ) {
      throw new OpenRouterError("timeout", "idle stream watchdog (90s)");
    }
    throw err;
  }

  let prompt_tokens = parsed.usage.prompt_tokens;
  let completion_tokens = parsed.usage.completion_tokens;
  let cost_usd = parsed.usage.cost_usd;
  let usage_estimated = false;

  if (cost_usd == null) {
    if (!prompt_tokens && !completion_tokens) {
      prompt_tokens = Math.ceil(
        params.messages.reduce((n, m) => n + m.content.length, 0) / 4,
      );
      completion_tokens = Math.ceil(parsed.text.length / 4);
      usage_estimated = true;
    }
    const pricing = cached?.pricing;
    if (pricing) {
      cost_usd =
        (prompt_tokens * pricing.prompt_usd_per_m) / 1e6 +
        (completion_tokens * pricing.completion_usd_per_m) / 1e6;
    } else {
      cost_usd = 0;
      usage_estimated = true;
    }
  }

  return {
    text: parsed.text,
    finish_reason: parsed.finish_reason,
    usage: {
      prompt_tokens,
      completion_tokens,
      cost_usd,
    },
    provider: parsed.provider,
    latency_ms: Date.now() - started,
    request_hash: hash,
    usage_estimated,
    degraded_params: degraded.length ? degraded : undefined,
    deliveredDeltas: parsed.deliveredDeltas,
  };
}

function isParamRejection(err: OpenRouterError): {
  temperature?: boolean;
  response_format?: boolean;
} | null {
  if (err.kind !== "bad_request" || err.status !== 400) return null;
  const msg =
    err.message +
    " " +
    String((err as OpenRouterError & { bodyText?: string }).bodyText ?? "");
  if (!/response_format|structured|temperature/i.test(msg)) return null;
  return {
    temperature: /temperature/i.test(msg),
    response_format: /response_format|structured/i.test(msg),
  };
}

export async function streamChat(
  params: StreamChatParams,
): Promise<StreamChatResult> {
  let lastError: OpenRouterError | null = null;
  let stripTemperature = false;
  let stripResponseFormat = false;
  let paramFallbackUsed = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await streamChatOnce(params, {
        stripTemperature,
        stripResponseFormat,
      });
      return result;
    } catch (err) {
      const orErr =
        err instanceof OpenRouterError
          ? err
          : new OpenRouterError(
              "upstream",
              err instanceof Error ? err.message : "unknown error",
            );
      lastError = orErr;

      if (orErr.kind === "aborted") {
        orErr.attempts = attempt;
        throw orErr;
      }

      // Parameter rejection: one immediate retry not counting against the 3
      if (!paramFallbackUsed) {
        const rejection = isParamRejection(orErr);
        if (rejection) {
          paramFallbackUsed = true;
          if (rejection.temperature) stripTemperature = true;
          if (rejection.response_format) stripResponseFormat = true;
          if (
            rejection.response_format &&
            getCachedModel(params.model)?.supports_structured_outputs
          ) {
            console.warn(
              `[openrouter] model ${params.model} rejected response_format despite catalog support`,
            );
          }
          attempt -= 1; // don't consume a retry slot
          continue;
        }
      }

      // Never retry auth / deterministic bad_request
      if (orErr.kind === "auth" || orErr.kind === "bad_request") {
        orErr.attempts = attempt;
        throw orErr;
      }

      // Candidate streams with delivered deltas: do not silently retry
      if (
        !params.allowRetryAfterPartial &&
        /partial|delivered/i.test(orErr.message) === false
      ) {
        // Check via a property we attach from streamChatOnce failures mid-stream
        // Mid-stream errors after deltas: orErr may be rate_limited/upstream.
        // We detect delivered deltas by inspecting a custom flag if present.
      }

      const delivered =
        (orErr as OpenRouterError & { deliveredDeltas?: boolean })
          .deliveredDeltas === true;
      if (delivered && !params.allowRetryAfterPartial) {
        orErr.attempts = attempt;
        throw orErr;
      }

      if (!orErr.retryable || attempt >= 3) {
        orErr.attempts = attempt;
        throw orErr;
      }

      const delay = backoffMs(attempt, orErr.retryAfterMs);
      params.onRetry?.(attempt + 1, delay, orErr.kind);
      await sleep(delay, params.signal);
    }
  }

  if (lastError) {
    lastError.attempts = 3;
    throw lastError;
  }
  throw new OpenRouterError("upstream", "streamChat failed", { attempts: 3 });
}

/** Cost helper used when usage was missing — pricing cache × tokens. */
export function estimateCostUsd(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const m = getCachedModel(modelId);
  if (!m?.pricing) return 0;
  return (
    (promptTokens * m.pricing.prompt_usd_per_m) / 1e6 +
    (completionTokens * m.pricing.completion_usd_per_m) / 1e6
  );
}
