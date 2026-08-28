import { apiFetch } from "@/lib/client/apiKey";
import { iterateSseFrames } from "@/lib/sse-parse";
import {
  GenerateSseEventSchema,
  GeneratedPackResultSchema,
  type GeneratePhase,
  type GeneratedPackResult,
} from "@/lib/schemas";

export type PackGenerateFailure = {
  code: string;
  message: string;
  hint?: string;
  kind?: string;
  status?: number;
  phase?: GeneratePhase;
  deliveredDeltas?: boolean;
  chars?: number;
  attempts?: number;
  model?: string;
};

export class PackGenerateError extends Error implements PackGenerateFailure {
  code: string;
  hint?: string;
  kind?: string;
  status?: number;
  phase?: GeneratePhase;
  deliveredDeltas?: boolean;
  chars?: number;
  attempts?: number;
  model?: string;

  constructor(failure: PackGenerateFailure) {
    super(failure.message);
    this.name = "PackGenerateError";
    this.code = failure.code;
    this.hint = failure.hint;
    this.kind = failure.kind;
    this.status = failure.status;
    this.phase = failure.phase;
    this.deliveredDeltas = failure.deliveredDeltas;
    this.chars = failure.chars;
    this.attempts = failure.attempts;
    this.model = failure.model;
  }

  toFailure(): PackGenerateFailure {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
      kind: this.kind,
      status: this.status,
      phase: this.phase,
      deliveredDeltas: this.deliveredDeltas,
      chars: this.chars,
      attempts: this.attempts,
      model: this.model,
    };
  }
}

export function failureFromUnknown(err: unknown): PackGenerateFailure {
  if (err instanceof PackGenerateError) return err.toFailure();
  if (err instanceof Error) {
    return { code: "INTERNAL_ERROR", message: err.message };
  }
  return { code: "INTERNAL_ERROR", message: "Generate failed" };
}

export function parseFailedGenerateResponse(
  status: number,
  text: string,
  contentType: string,
): PackGenerateFailure {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const body = JSON.parse(text) as {
        error?: { message?: string; code?: string };
      };
      if (body.error?.message) {
        return {
          code: body.error.code ?? `HTTP_${status}`,
          message: body.error.message,
          status,
        };
      }
    } catch {
      // fall through
    }
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return {
      code: "HTML_ERROR",
      message: `The generate endpoint returned an HTML error page (HTTP ${status}) instead of a stream.`,
      hint: "The reverse proxy or Next.js timed out or crashed. Check the host logs for that status.",
      status,
    };
  }
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 180);
  return {
    code: `HTTP_${status}`,
    message: snippet || `Generate failed (HTTP ${status})`,
    status,
  };
}

/** @deprecated use parseFailedGenerateResponse */
export function messageFromFailedResponse(
  status: number,
  text: string,
  contentType: string,
): string {
  return parseFailedGenerateResponse(status, text, contentType).message;
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
      throw new PackGenerateError({
        code: "CANCELLED",
        message: "Generation cancelled.",
        hint: "You stopped the generator.",
      });
    }
    throw new PackGenerateError({
      code: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "Could not reach the generator.",
      hint: "The browser lost the connection before a stream started.",
    });
  }

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/event-stream")) {
    const text = await res.text();
    throw new PackGenerateError(parseFailedGenerateResponse(res.status, text, ct));
  }

  if (!res.body) {
    throw new PackGenerateError({
      code: "UPSTREAM_ERROR",
      message: "Generator returned an empty stream.",
    });
  }

  let complete: GeneratedPackResult | null = null;
  let chars = 0;
  let lastPhase: GeneratePhase | undefined;
  let skippedJson = 0;
  let skippedSchema = 0;
  try {
    for await (const frame of iterateSseFrames(res.body, opts.signal)) {
      let data: unknown;
      try {
        data = JSON.parse(frame.data);
      } catch {
        skippedJson += 1;
        continue;
      }
      const checked = GenerateSseEventSchema.safeParse({ event: frame.event, data });
      if (!checked.success) {
        skippedSchema += 1;
        continue;
      }
      const evt = checked.data;
      switch (evt.event) {
        case "generate.status":
          lastPhase = evt.data.phase;
          opts.onStatus(evt.data.phase, evt.data.notice);
          break;
        case "generate.delta":
          chars += evt.data.delta.length;
          opts.onDelta(evt.data.delta);
          break;
        case "generate.complete":
          complete = evt.data;
          break;
        case "generate.error":
          throw new PackGenerateError({
            ...evt.data,
            chars: evt.data.chars ?? chars,
            phase: evt.data.phase ?? lastPhase,
          });
        case "generate.heartbeat":
          break;
      }
    }
  } catch (err) {
    if (opts.signal.aborted) {
      throw new PackGenerateError({
        code: "CANCELLED",
        message: "Generation cancelled.",
        hint: "You stopped the generator.",
        chars,
        phase: lastPhase,
      });
    }
    throw err;
  }

  if (opts.signal.aborted) {
    throw new PackGenerateError({
      code: "CANCELLED",
      message: "Generation cancelled.",
      hint: "You stopped the generator.",
      chars,
      phase: lastPhase,
    });
  }
  if (!complete) {
    throw new PackGenerateError({
      code: "STREAM_ENDED",
      message:
        chars > 0
          ? `The generator stream closed after ${chars} characters, before a finished bundle.`
          : "The generator stream ended before a draft arrived.",
      hint: "The host or model cut the connection. Try a faster model or fewer prompts.",
      chars,
      phase: lastPhase,
      deliveredDeltas: chars > 0,
    });
  }
  const parsed = GeneratedPackResultSchema.safeParse(complete);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? first.path.join(".") : "root";
    throw new PackGenerateError({
      code: "VALIDATION_ERROR",
      message: "Generator finished but the bundle payload was invalid.",
      hint: first ? `${where}: ${first.message}` : undefined,
    });
  }
  return parsed.data;
}
