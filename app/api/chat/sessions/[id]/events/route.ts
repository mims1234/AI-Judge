import { apiError, formatSseFrame } from "@/lib/api-helpers";
import { getChatEngine } from "@/lib/chat-engine";
import { prepare } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Statuses with no in-flight engine work — the stream can close after replay. */
const QUIESCENT = new Set(["active", "judged", "error"]);

export async function GET(request: Request, ctx: Params) {
  const { id } = await ctx.params;
  const session = prepare(`SELECT id, status FROM chat_sessions WHERE id = ?`).get(
    id,
  ) as { id: string; status: string } | undefined;
  if (!session) {
    return apiError("SESSION_NOT_FOUND", 404, `No chat session with id ${id}`);
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("lastEventId");
  const header = request.headers.get("Last-Event-ID");
  let cursor = 0;
  if (q != null && q !== "") {
    cursor = Number(q);
  } else if (header) {
    cursor = Number(header);
  }
  if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let highestSent = cursor;
  // Hoisted so cancel() can run the same teardown as abort/quiescent paths.
  let cleanup = () => {
    closed = true;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (frame: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          closed = true;
        }
      };

      // Replay persisted events
      const events = prepare(
        `SELECT id, type, payload FROM chat_events
         WHERE session_id = ? AND id > ? ORDER BY id ASC`,
      ).all(id, cursor) as Array<{ id: number; type: string; payload: string }>;
      for (const ev of events) {
        let data: unknown = {};
        try {
          data = JSON.parse(ev.payload);
        } catch {
          data = {};
        }
        send(formatSseFrame({ event: ev.type, data, id: ev.id }));
        highestSent = Math.max(highestSent, ev.id);
      }

      const engine = getChatEngine();
      const ee = engine.events(id);
      const onEvent = (evt: { id?: number; type: string; payload: unknown }) => {
        if (evt.id != null && evt.id <= highestSent) return;
        send(formatSseFrame({ event: evt.type, data: evt.payload, id: evt.id }));
        if (evt.id != null) highestSent = Math.max(highestSent, evt.id);
        // Close when the session goes quiescent (reply finished / judging done).
        if (
          evt.type === "chat.session.status" &&
          typeof evt.payload === "object" &&
          evt.payload !== null &&
          QUIESCENT.has(
            String((evt.payload as { status?: unknown }).status ?? ""),
          )
        ) {
          setTimeout(() => {
            cleanup();
            try {
              controller.close();
            } catch {
              // ignore
            }
          }, 50);
        }
      };
      ee.on("event", onEvent);

      heartbeat = setInterval(() => {
        send(formatSseFrame({ event: "heartbeat", data: { sessionId: id, ts: Date.now() } }));
      }, 15_000);

      // Already quiescent: replay only, then close.
      const statusNow = prepare(`SELECT status FROM chat_sessions WHERE id = ?`).get(
        id,
      ) as { status: string };
      if (QUIESCENT.has(statusNow.status)) {
        setTimeout(() => {
          cleanup();
          try {
            controller.close();
          } catch {
            // ignore
          }
        }, 50);
      }

      const onAbort = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // ignore
        }
      };
      request.signal.addEventListener("abort", onAbort);

      cleanup = () => {
        if (closed) return;
        closed = true;
        ee.off("event", onEvent);
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        request.signal.removeEventListener("abort", onAbort);
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
