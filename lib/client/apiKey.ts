/**
 * Browser-side OpenRouter BYOK store.
 * Key lives only in localStorage — never sent to SQLite / never logged.
 */

export const API_KEY_STORAGE_KEY = "ai-judge:openrouter-key";
export const OPENROUTER_KEY_HEADER = "x-openrouter-key";

/** Fired on window when the stored key changes (same-tab). */
export const API_KEY_CHANGED_EVENT = "ai-judge:api-key-changed";

export function getStoredApiKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function setStoredApiKey(key: string): void {
  if (typeof window === "undefined") return;
  const trimmed = key.trim();
  if (!trimmed) {
    clearStoredApiKey();
    return;
  }
  localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
  window.dispatchEvent(new Event(API_KEY_CHANGED_EVENT));
}

export function clearStoredApiKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  window.dispatchEvent(new Event(API_KEY_CHANGED_EVENT));
}

export function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.length < 4) return "····";
  return trimmed.slice(-4);
}

export function hasStoredApiKey(): boolean {
  return getStoredApiKey() !== null;
}

/**
 * fetch wrapper that injects the BYOK header when a browser key is stored.
 * Use for any AI-touching API call (runs, preflight, models refresh, test-key).
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const key = getStoredApiKey();
  if (key && !headers.has(OPENROUTER_KEY_HEADER)) {
    headers.set(OPENROUTER_KEY_HEADER, key);
  }
  return fetch(input, { ...init, headers });
}

/** True when a response is the structured NEEDS_KEY 401. */
export function isNeedsKeyResponse(
  status: number,
  body: unknown,
): boolean {
  if (status !== 401) return false;
  const code =
    body &&
    typeof body === "object" &&
    "error" in body &&
    (body as { error?: { code?: string } }).error?.code;
  return code === "NEEDS_KEY";
}
