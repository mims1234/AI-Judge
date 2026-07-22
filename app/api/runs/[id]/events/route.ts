import { apiError, formatSseFrame } from "@/lib/api-helpers";
import { prepare } from "@/lib/db";
import { getRunEngine } from "@/lib/run-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const TERMINAL = new Set(["completed", "cancelled", "incomplete"]);

export async function GET(request: Request, ctx: Params) {
  const { id } = await ctx.params;
  const run = prepare(`SELECT id, status FROM runs WHERE id = ?`).get(id) as
    | { id: string; status: string }
    | undefined;
  if (!run) {
    return apiError("RUN_NOT_FOUND", 404, `No run with id ${id}`);
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
      const minId = prepare(
        `SELECT MIN(id) AS m FROM run_events WHERE run_id = ?`,
      ).get(id) as { m: number | null };
      if (cursor > 0 && minId.m != null && cursor < minId.m - 1) {
        // Defensive resync if cursor cannot be served
        send(
          formatSseFrame({
            event: "resync",
            data: { runId: id, lastEventId: highestSent },
          }),
        );
      } else {
        const events = prepare(
          `SELECT id, type, payload FROM run_events
           WHERE run_id = ? AND id > ? ORDER BY id ASC`,
        ).all(id, cursor) as Array<{
          id: number;
          type: string;
          payload: string;
        }>;
        for (const ev of events) {
          let data: unknown = {};
          try {
            data = JSON.parse(ev.payload);
          } catch {
            data = {};
          }
          send(
            formatSseFrame({ event: ev.type, data, id: ev.id }),
          );
          highestSent = Math.max(highestSent, ev.id);
        }
      }

      const engine = getRunEngine();
      const ee = engine.events(id);
      const onEvent = (evt: {
        id?: number;
        type: string;
        payload: unknown;
      }) => {
        if (evt.id != null && evt.id <= highestSent) return;
        send(
          formatSseFrame({
            event: evt.type,
            data: evt.payload,
            id: evt.id,
          }),
        );
        if (evt.id != null) highestSent = Math.max(highestSent, evt.id);
        if (evt.type === "run.complete") {
          cleanup();
          try {
            controller.close();
          } catch {
            // ignore
          }
        }
      };
      ee.on("event", onEvent);

      heartbeat = setInterval(() => {
        send(
          formatSseFrame({
            event: "heartbeat",
            data: { runId: id, ts: Date.now() },
          }),
        );
      }, 15_000);

      // If already terminal and no further events expected, close after replay
      const statusNow = prepare(`SELECT status FROM runs WHERE id = ?`).get(
        id,
      ) as { status: string };
      if (TERMINAL.has(statusNow.status)) {
        // Allow a tick for any in-flight emits, then close
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

      function cleanup() {
        if (closed) return;
        closed = true;
        ee.off("event", onEvent);
        if (heartbeat) clearInterval(heartbeat);
        request.signal.removeEventListener("abort", onAbort);
      }
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
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
