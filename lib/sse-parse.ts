/** Shared SSE frame splitter for fetch streams (generate, tests). */

export type SseFrame = {
  event: string;
  data: string;
  id?: string;
};

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function parseSseFrame(raw: string): SseFrame | null {
  let event = "message";
  let id: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
    else if (field === "id") id = value;
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n"), id };
}

export function splitSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const normalized = normalizeNewlines(buffer);
  const frames: SseFrame[] = [];
  let rest = normalized;
  let idx = rest.indexOf("\n\n");
  while (idx !== -1) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    const frame = parseSseFrame(raw);
    if (frame) frames.push(frame);
    idx = rest.indexOf("\n\n");
  }
  return { frames, rest };
}

export async function* iterateSseFrames(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const onAbort = () => {
    void reader.cancel();
  };
  signal?.addEventListener("abort", onAbort);
  try {
    while (true) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const split = splitSseFrames(buf);
      buf = split.rest;
      for (const frame of split.frames) yield frame;
    }
    if (buf.trim()) {
      const frame = parseSseFrame(normalizeNewlines(buf).trim());
      if (frame) yield frame;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      // already cancelled
    }
  }
}
