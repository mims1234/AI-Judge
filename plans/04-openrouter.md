# 04 — OpenRouter Integration (`lib/openrouter.ts`)

## Purpose

Specify the single OpenRouter client module: model catalog fetching with the `models_cache` SQLite cache, streaming chat completions with SSE delta parsing and usage/cost capture, structured-output requests, cancellation, bounded retry policy, and server-only API-key handling.

## Scope

- `lib/openrouter.ts` — the only file in the app allowed to call OpenRouter over the network.
- The `models_cache` table read/write logic and pricing normalization.
- Retry/backoff/failure classification consumed by the run engine (plan 05).
- Key-status check consumed by `/settings` and by API routes returning `NO_API_KEY`.

Out of scope: which prompts get sent (plan 05 builds them), how judgments are scored (plan 06), route handler shapes (plan 03).

---

## Environment & key handling

From `.env.local` (never committed; `.env.example` documents the names):

```
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

Rules:

- The key is read **only** inside `lib/openrouter.ts` via `process.env.OPENROUTER_API_KEY`. No `NEXT_PUBLIC_` variant may ever exist; the key must never reach client bundles, snapshots, exports, logs, or error messages.
- `OPENROUTER_BASE_URL` defaults to `https://openrouter.ai/api/v1` when unset.
- Every request sends headers:
  - `Authorization: Bearer <key>`
  - `HTTP-Referer: http://localhost:3000` and `X-Title: AI Judge` (OpenRouter attribution conventions)
  - `Content-Type: application/json` on POSTs.

**Key status check** — exported for `/settings` and route guards:

```ts
export type KeyStatus =
  | { state: "missing" }                      // env var absent/empty
  | { state: "invalid"; message: string }     // 401 from OpenRouter
  | { state: "ok"; label?: string; usage_usd?: number; limit_usd?: number | null };

export async function checkKeyStatus(): Promise<KeyStatus>;
```

Implementation: if env var empty → `missing` without a network call. Otherwise `GET {base}/auth/key`; 200 → `ok` with `data.label`, `data.usage`, `data.limit`; 401 → `invalid`; other failures → treat as `ok`-unknown? No — return `{ state: "invalid", message: "status check failed: <status>" }` only for 401/403, and rethrow network errors so `/settings` can show "couldn't reach OpenRouter" distinctly. Also export `hasApiKey(): boolean` (sync, env-only) for cheap route guards that back the `503 NO_API_KEY` error in plan 03.

---

## Model catalog

### Upstream endpoint

`GET {base}/models`. Relevant response shape (fields we consume; everything else ignored):

```json
{
  "data": [
    {
      "id": "anthropic/claude-sonnet-4",
      "name": "Anthropic: Claude Sonnet 4",
      "context_length": 200000,
      "pricing": { "prompt": "0.000003", "completion": "0.000015" },
      "supported_parameters": ["temperature", "response_format", "structured_outputs", "seed"],
      "architecture": { "input_modalities": ["text"], "output_modalities": ["text"] }
    }
  ]
}
```

Parse with a **lenient** Zod schema (`OpenRouterModelSchema` in `lib/schemas.ts`): unknown fields stripped, individual malformed entries skipped with a warning log rather than failing the whole fetch. `pricing.prompt`/`pricing.completion` are **strings, USD per single token**; normalize to numbers in USD per **million** tokens: `prompt_usd_per_m = parseFloat(pricing.prompt) * 1_000_000`. Non-finite parse → treat model as unpriced (`null` pricing; excluded from cost estimates, flagged in UI).

### `models_cache` table (DDL owned by `plans/01-database.md` §3.3)

Columns: `openrouter_id TEXT PRIMARY KEY`, `name`, `context_length`, `pricing_json`, `raw_json`, `fetched_at INTEGER` (Unix epoch ms, per plan 01's timestamp convention), with index `idx_models_fetched ON models_cache(fetched_at)`.

This module's mapping onto that schema:

- `pricing_json` stores the **normalized** pricing snapshot `{ "prompt_usd_per_m": number, "completion_usd_per_m": number }`, or `null` for unpriced models.
- `raw_json` stores the full upstream entry for forward-compat.
- `supports_structured_outputs` and `is_free` are **derived at read time** in `lib/openrouter.ts` (from `raw_json.supported_parameters` and the normalized prices respectively) and exposed on `CatalogModel` — they are not stored columns.

Refresh strategy = full-replace upsert inside one transaction: upsert every fetched row with the new `fetched_at`, then delete rows whose `fetched_at` predates this refresh (models removed upstream disappear from the picker, but historical runs are unaffected because runs snapshot everything they need).

### Public API

```ts
export interface CatalogModel {
  id: string; name: string; context_length: number;
  pricing: { prompt_usd_per_m: number; completion_usd_per_m: number } | null;
  supports_structured_outputs: boolean; is_free: boolean;
}
export interface CatalogResult { source: "cache" | "stale" | "network"; fetched_at: string; models: CatalogModel[]; }

export async function getModelCatalog(opts?: { forceRefresh?: boolean }): Promise<CatalogResult>;
export function getCachedModel(modelId: string): CatalogModel | null;   // sync SQLite read; used by preflight & cost estimator
```

`getModelCatalog` implements exactly the cache policy in plan 03 § `/api/models`: TTL 60 minutes; stale rows are served immediately while a deduplicated background refresh runs (a module-level in-flight promise prevents concurrent refresh stampedes); empty cache fetches synchronously; empty cache + upstream failure throws `OpenRouterError` with `kind: "upstream"` (route maps to 502).

---

## Streaming chat completions

### Request shape

`POST {base}/chat/completions` with body:

```json
{
  "model": "openai/gpt-5.1",
  "messages": [ { "role": "system", "content": "..." }, { "role": "user", "content": "..." } ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 2048,
  "usage": { "include": true },
  "response_format": {
    "type": "json_schema",
    "json_schema": { "name": "judge_output", "strict": true, "schema": { "...": "..." } }
  }
}
```

Rules:

- `stream: true` always — both candidate and judge calls stream (judges stream so the UI can show live judging).
- `usage: { include: true }` always, so the final SSE chunk carries token usage and cost.
- `temperature`: taken from the caller; run engine passes the run's candidate temperature for candidates and `0` for judges (master plan: judges use temperature 0 where supported; if the model rejects the parameter, retry once without it — see parameter-rejection handling below).
- `response_format` (structured outputs): included **only** when the caller asks for it **and** `models_cache.supports_structured_outputs` is true for the model. Judges request it with `JudgeOutputSchema` converted to JSON Schema (conversion lives in `lib/schemas.ts` as `judgeOutputJsonSchema` — hand-written, not runtime-derived, so the wire schema is stable and reviewable). Candidates never use it in v1 (task prompts specify their own output formats; validators check them).
- `max_tokens`: the task's `token_limit` for candidates; a fixed `1536` for judges.

### Public streaming API

```ts
export interface StreamChatParams {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature: number;
  maxTokens: number;
  responseFormat?: { name: string; schema: object };   // structured outputs; applied only if model supports it
  signal: AbortSignal;                                  // cancellation — REQUIRED
  onDelta: (textDelta: string) => void;                 // called per content delta
}

export interface StreamChatResult {
  text: string;                                   // full concatenated content
  finish_reason: string;                          // "stop" | "length" | "content_filter" | ...
  usage: { prompt_tokens: number; completion_tokens: number; cost_usd: number };
  provider: string | null;                        // upstream provider name if reported
  latency_ms: number;                             // request start → stream end
  request_hash: string;                           // see idempotency note below
}

export async function streamChat(params: StreamChatParams): Promise<StreamChatResult>;   // throws OpenRouterError
```

`request_hash` = SHA-256 of the canonical JSON of `{ model, messages, temperature, max_tokens, response_format }`. The run engine uses it for within-run idempotency (plan 05); computing it here keeps hashing in one place.

### SSE delta parsing

OpenRouter streams `text/event-stream` frames: `data: {json}\n\n`, terminated by `data: [DONE]`. Parser requirements:

1. Read `response.body` via `getReader()` + `TextDecoder(stream: true)`; maintain a string buffer; split on `\n`; a frame ends at an empty line. **Never assume one chunk == one frame** — frames split across TCP chunks must reassemble, and multiple frames per chunk must all be processed.
2. Ignore SSE comment lines (`: OPENROUTER PROCESSING` keep-alives) and non-`data:` fields.
3. For each `data:` line: if payload is `[DONE]`, finish. Else `JSON.parse`; on parse failure of a single frame, log and skip it (do not kill the stream).
4. Per parsed chunk:
   - `choices[0].delta.content` (non-empty string) → append to buffer, call `onDelta(delta)`.
   - `choices[0].finish_reason` (non-null) → record it.
   - Mid-stream error object (`{"error": {...}}` — OpenRouter can emit these inside a 200 stream) → throw `OpenRouterError` classified from `error.code` (429 → `rate_limited`, 5xx → `upstream`, else `bad_request`).
   - `usage` present (final chunk when `usage.include` set) → capture `prompt_tokens`, `completion_tokens`, and `usage.cost` (OpenRouter reports cost in USD credits) → `cost_usd`.
5. If the stream ends without a `usage` chunk (provider quirk), compute a fallback `cost_usd` from `models_cache` pricing × token counts; if token counts are also absent, estimate tokens as `ceil(chars / 4)` and set a `usage_estimated: true` flag the engine persists in the task result's `error`-free metadata. Never fail a completed stream just because usage was missing.
6. An idle-stream watchdog: if no bytes arrive for `90s`, abort with `OpenRouterError(kind: "timeout")`. Overall request deadline: `600s` for candidates, `240s` for judges (caller passes it; implemented via `AbortSignal.any([params.signal, AbortSignal.timeout(deadlineMs)])`).

### Cancellation

- `params.signal` aborts the underlying `fetch`. On abort, `streamChat` throws `OpenRouterError(kind: "aborted")` and the partial buffer is discarded by the client (the engine decides whether to persist partial text; per plan 05 it does not — aborted tasks keep their prior checkpoint status).
- Aborting the fetch closes the connection; OpenRouter stops billing for undelivered tokens. This is the mechanism behind run cancel/pause.

---

## Retry policy

Applies to **connection-level and pre-first-token failures, 429, 5xx, and timeouts**. Never retry: 400/401/403/404 (`bad_request`/auth — deterministic failures), mid-stream aborts by the user, or streams that already delivered content deltas for a *candidate* call (a half-delivered candidate answer must not be silently regenerated and double-billed — the attempt fails and the engine's task-level handling takes over; judge calls MAY retry after partial delivery because judge output is discarded unless parsed).

Algorithm (`withRetries` internal helper wrapping `streamChat` attempts):

- Max **3 attempts total** (initial + 2 retries).
- Backoff delay before retry *n* (1-indexed): `min(8000, 1000 * 2^(n-1)) + jitter`, jitter uniform in `[0, 500)` ms → ~1s, ~2s (each ±jitter).
- On 429 with a `Retry-After` header, use `max(computedBackoff, retryAfterMs)` capped at 30s.
- Each retry emits progress via an optional `onRetry(attempt, delayMs, reason)` callback (the engine forwards it as a `notice` SSE event with code `RETRY_SCHEDULED`, plan 03).
- After the 3rd failed attempt, throw the final `OpenRouterError` with `attempts: 3`. **The caller (run engine) marks the task_result as an infrastructure failure: `status = 'error'`, `error.kind = 'infra_failure'` — the result becomes `incomplete`-contributing and is NEVER recorded as a zero score.** This module never converts failures into scores; it only classifies them.

### Error type

```ts
export class OpenRouterError extends Error {
  kind: "missing_key" | "auth" | "rate_limited" | "upstream" | "timeout" | "aborted" | "bad_request";
  status?: number;        // HTTP status when applicable
  attempts: number;       // how many attempts were made
  retryable: boolean;     // kind ∈ rate_limited | upstream | timeout
}
```

### Parameter-rejection fallback

Some models reject `temperature` or `response_format` with a 400 naming the parameter. Detection: status 400 + error message matching `/response_format|structured|temperature/i`. Handling: retry **once immediately** (not counted against the 3 retry attempts) with the offending parameter removed; record `degraded_params: string[]` on the result so the engine can persist that the call ran without structured outputs / pinned temperature. If the model catalog said `supports_structured_outputs` but the call still bounced, log a warning — do not update the cache row (it refreshes hourly anyway).

---

## Files to implement

- `lib/openrouter.ts` — everything above: `hasApiKey`, `checkKeyStatus`, `getModelCatalog`, `getCachedModel`, `streamChat`, `OpenRouterError`, internal SSE parser + retry helper.
- `lib/schemas.ts` (shared, owned by plan 03) — add `OpenRouterModelSchema`, `judgeOutputJsonSchema`.
- Migrations (owned by `plans/01-database.md`) — include the `models_cache` DDL as specified there (§3.3); this module writes `pricing_json`/`raw_json` per the mapping above.
- `.env.example` — the three env var names with comments.

## Contracts with other modules

- **plan 03**: `/api/models` calls `getModelCatalog`; preflight calls `getCachedModel` per model id; route guards call `hasApiKey` for `503 NO_API_KEY`; `/settings` (plan 07+) calls `checkKeyStatus` through a thin API route or server component.
- **plan 05 (run engine)**: sole consumer of `streamChat` + retry semantics; passes AbortSignals from its pause/cancel controllers; consumes `request_hash` for idempotency; maps `OpenRouterError` after 3 attempts to `task_results.status='error'` with `infra_failure`.
- **plan 06 (scoring)**: `estimateRunCost` reads pricing via `getCachedModel`; live cost counter sums `usage.cost_usd` values this module reports.

## Acceptance criteria

- [ ] API key is referenced only in `lib/openrouter.ts`, never in client code, exports, or logs; `hasApiKey`/`checkKeyStatus` behave as specified (missing / invalid via 401 / ok with usage fields).
- [ ] Catalog fetch normalizes pricing to USD-per-million floats, derives `supports_structured_outputs` and `is_free`, skips malformed entries without failing the batch, and full-replace-upserts `models_cache` in one transaction.
- [ ] Cache policy: <60 min serves cache; ≥60 min serves stale and revalidates in background exactly once even under concurrent callers; empty cache + upstream failure throws `kind:"upstream"`.
- [ ] `streamChat` sends `stream:true` and `usage.include:true`, applies `response_format` json_schema only when the model supports it, and returns full text, finish_reason, usage with `cost_usd`, provider, latency, and `request_hash`.
- [ ] SSE parser handles frames split across chunks, multiple frames per chunk, comment keep-alives, mid-stream error objects, missing final usage (pricing-cache fallback + `usage_estimated`), and `[DONE]`.
- [ ] AbortSignal cancels the fetch promptly; watchdog aborts after 90 s idle; deadlines enforced via `AbortSignal.any`.
- [ ] Retries: max 3 attempts on 429/5xx/timeout with exponential backoff + jitter and `Retry-After` respect; 4xx auth/bad-request never retried; candidate streams with delivered deltas never silently retried; final failure throws with `attempts: 3` and the engine records infra failure — never a zero score.
- [ ] Parameter-rejection fallback strips the offending parameter, retries once, and reports `degraded_params`.
- [ ] Unit tests (Vitest, mocked fetch): pricing normalization, cache TTL/stale/refresh-dedupe, chunk-split SSE fixtures, mid-stream error, usage fallback, backoff schedule (fake timers), abort propagation, parameter-rejection fallback.
