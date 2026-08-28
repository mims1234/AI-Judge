import { apiFetch } from "@/lib/client/apiKey";
import { iterateSseFrames } from "@/lib/sse-parse";
import {
  GenerateSseEventSchema,
  GeneratedPackResultSchema,
  type GeneratePhase,
  type GeneratedPackResult,
} from "@/lib/schemas";

export class PackGenerateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PackGenerateError";
    this.code = code;
  }
}

export function messageFromFailedResponse(
  status: number,
  text: string,
  contentType: string,
): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const body = JSON.parse(text) as { error?: { message?: string; code?: string } };
      if (body.error?.message) return body.error.message;
    } catch {
      // fall through
    }
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return `Generate failed (HTTP ${status}). The connection dropped while the model was writing. Try again.`;
  }
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 180);
  return snippet || `Generate failed (HTTP ${status})`;
}

export async function streamPackGenerate(opts: {
  body: unknown;
  signal: AbortSignal;
  onStatus: (phase: GeneratePhase, notice?: string) => void;
  onDelta: (delta: string) => void;
}): Promise<GeneratedPackResult> {
  let res: Response;
  try {
    res = await apiFetch("/api/bundles/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err) {
    if (opts.signal.aborted) {
      throw new PackGenerateError("CANCELLED", "Generation cancelled.");
    }
    throw new PackGenerateError(
      "UPSTREAM_ERROR",
      err instanceof Error ? err.message : "Could not reach the generator.",
    );
  }

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/event-stream")) {
    const text = await res.text();
    throw new PackGenerateError(
      "UPSTREAM_ERROR",
      messageFromFailedResponse(res.status, text, ct),
    );
  }

  if (!res.body) {
    throw new PackGenerateError("UPSTREAM_ERROR", "Generator returned an empty stream.");
  }

  let complete: GeneratedPackResult | null = null;
  try {
    for await (const frame of iterateSseFrames(res.body, opts.signal)) {
      let data: unknown;
      try {
        data = JSON.parse(frame.data);
      } catch {
        continue;
      }
      const checked = GenerateSseEventSchema.safeParse({ event: frame.event, data });
      if (!checked.success) continue;
      const evt = checked.data;
      switch (evt.event) {
        case "generate.status":
          opts.onStatus(evt.data.phase, evt.data.notice);
          break;
        case "generate.delta":
          opts.onDelta(evt.data.delta);
          break;
        case "generate.complete":
          complete = evt.data;
          break;
        case "generate.error":
          throw new PackGenerateError(evt.data.code, evt.data.message);
        case "generate.heartbeat":
          break;
      }
    }
  } catch (err) {
    if (opts.signal.aborted) {
      throw new PackGenerateError("CANCELLED", "Generation cancelled.");
    }
    throw err;
  }

  if (opts.signal.aborted) {
    throw new PackGenerateError("CANCELLED", "Generation cancelled.");
  }
  if (!complete) {
    throw new PackGenerateError(
      "UPSTREAM_ERROR",
      "The generator stream ended before a draft arrived. Try again.",
    );
  }
  const parsed = GeneratedPackResultSchema.safeParse(complete);
  if (!parsed.success) {
    throw new PackGenerateError(
      "VALIDATION_ERROR",
      "Generator finished but the pack payload was invalid.",
    );
  }
  return parsed.data;
}
