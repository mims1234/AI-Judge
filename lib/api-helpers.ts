import { NextResponse } from "next/server";
import type { z } from "zod";
import { EPHEMERAL_SSE_EVENTS } from "@/lib/schemas";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "RUN_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "BUNDLE_NOT_FOUND"
  | "INVALID_STATE"
  | "INTERNAL_ERROR"
  | "UPSTREAM_ERROR"
  | "NO_API_KEY"
  | "NEEDS_KEY"
  | "PREFLIGHT_FAILED"
  | "BUNDLE_NOT_PUBLISHED"
  | "MODEL_UNAVAILABLE"
  | "CONTEXT_TOO_SMALL"
  | "JUDGE_POOL_TOO_SMALL";

/** Header clients send with a user-supplied OpenRouter key (BYOK). */
export const OPENROUTER_KEY_HEADER = "x-openrouter-key";

/**
 * Read optional user OpenRouter key from the request.
 * Never log the returned value.
 */
export function getKeyFromRequest(request: Request): string | null {
  const raw = request.headers.get(OPENROUTER_KEY_HEADER);
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 401 when no user key and no non-prod env fallback is available. */
export function needsKeyError(
  message = "Add your OpenRouter API key in Settings to use this feature.",
): NextResponse {
  return apiError("NEEDS_KEY", 401, message);
}

export function apiError(
  code: string,
  status: number,
  message: string,
  details: unknown = null,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, details } },
    { status },
  );
}

export function parseBody<T extends z.ZodType>(
  schema: T,
  raw: unknown,
):
  | { ok: true; data: z.infer<T> }
  | { ok: false; response: NextResponse } {
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: apiError("VALIDATION_ERROR", 400, "Request validation failed", {
        issues: result.error.issues,
      }),
    };
  }
  return { ok: true, data: result.data };
}

export function parseQuery<T extends z.ZodType>(
  schema: T,
  searchParams: URLSearchParams,
):
  | { ok: true; data: z.infer<T> }
  | { ok: false; response: NextResponse } {
  const obj: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    obj[key] = value;
  }
  return parseBody(schema, obj);
}

/** Format one SSE frame. Ephemeral events omit the `id:` field. */
export function formatSseFrame(opts: {
  event: string;
  data: unknown;
  id?: number;
}): string {
  const lines: string[] = [];
  const ephemeral = EPHEMERAL_SSE_EVENTS.has(opts.event);
  if (!ephemeral && opts.id !== undefined) {
    lines.push(`id: ${opts.id}`);
  }
  lines.push(`event: ${opts.event}`);
  lines.push(`data: ${JSON.stringify(opts.data)}`);
  lines.push("");
  lines.push("");
  return lines.join("\n");
}

export function isoFromMs(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

/** RFC 4180 CSV cell with formula-injection neutralization. */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}
