import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";

export type MockBehavior =
  | { kind: "sse"; fixtureRelPath: string; chunkBytes?: number; delayMs?: number }
  | { kind: "status"; status: number; body?: string; headers?: Record<string, string> }
  | { kind: "hang"; ms: number }
  | { kind: "drop" };

export type RouteMatcher = {
  /** Match when request body JSON includes this substring (model id, role, etc.). */
  includes?: string;
  /** Match stream:true vs false when set. */
  stream?: boolean;
  behavior: MockBehavior;
};

export type MockOpenRouter = {
  port: number;
  baseUrl: string;
  url: string;
  requests: Array<{ method: string; url: string; body: string }>;
  setRoutes: (routes: RouteMatcher[]) => void;
  setDefaultChat: (behavior: MockBehavior) => void;
  close: () => Promise<void>;
};

const FIXTURES = path.resolve(process.cwd(), "tests/fixtures");

function readFixture(rel: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES, rel));
}

function modelsPayload(): unknown {
  const p = path.join(FIXTURES, "models/list.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function writeSse(
  res: http.ServerResponse,
  buf: Buffer,
  opts: { chunkBytes?: number; delayMs?: number },
  req: http.IncomingMessage,
): Promise<"ok" | "aborted"> {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const chunkSize = opts.chunkBytes ?? 64;
  let offset = 0;
  let aborted = false;
  req.on("aborted", () => {
    aborted = true;
  });
  req.on("close", () => {
    if (!res.writableEnded) aborted = true;
  });

  while (offset < buf.length) {
    if (aborted) return "aborted";
    const end = Math.min(buf.length, offset + chunkSize);
    res.write(buf.subarray(offset, end));
    offset = end;
    if (opts.delayMs && opts.delayMs > 0) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
  }
  if (!aborted) res.end();
  return aborted ? "aborted" : "ok";
}

function pickBehavior(
  routes: RouteMatcher[],
  defaultChat: MockBehavior,
  body: string,
): MockBehavior {
  let stream: boolean | undefined;
  try {
    const parsed = JSON.parse(body) as { stream?: boolean };
    stream = parsed.stream;
  } catch {
    stream = undefined;
  }
  for (const route of routes) {
    if (route.includes != null && !body.includes(route.includes)) continue;
    if (route.stream != null && route.stream !== stream) continue;
    return route.behavior;
  }
  return defaultChat;
}

/**
 * In-process OpenRouter mock (plans/11 §2 harness).
 * Serves GET /models and POST /chat/completions with scripted SSE/status/hang/drop.
 */
export async function startMockOpenRouter(
  preferredPort = 0,
): Promise<MockOpenRouter> {
  let routes: RouteMatcher[] = [];
  let defaultChat: MockBehavior = {
    kind: "sse",
    fixtureRelPath: "sse/candidate-stream-happy.sse",
  };
  const requests: MockOpenRouter["requests"] = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1`);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ method: req.method ?? "GET", url: url.pathname, body });

    try {
      if (req.method === "GET" && url.pathname.endsWith("/models")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(modelsPayload()));
        return;
      }

      if (req.method === "POST" && url.pathname.includes("/chat/completions")) {
        const behavior = pickBehavior(routes, defaultChat, body);

        if (behavior.kind === "status") {
          res.writeHead(behavior.status, {
            "Content-Type": "application/json",
            ...(behavior.headers ?? {}),
          });
          res.end(behavior.body ?? JSON.stringify({ error: { message: "mock" } }));
          return;
        }

        if (behavior.kind === "hang") {
          await new Promise((r) => setTimeout(r, behavior.ms));
          if (!res.headersSent) {
            res.writeHead(504);
            res.end("hang timeout");
          }
          return;
        }

        if (behavior.kind === "drop") {
          res.writeHead(200, { "Content-Type": "text/event-stream" });
          res.write("data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n");
          res.destroy();
          return;
        }

        const buf = readFixture(behavior.fixtureRelPath);
        await writeSse(
          res,
          buf,
          { chunkBytes: behavior.chunkBytes, delayMs: behavior.delayMs },
          req,
        );
        return;
      }

      res.writeHead(404);
      res.end("not found");
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(String(err));
      }
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(preferredPort, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("mock server failed to bind");
  const port = addr.port;

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    url: `http://127.0.0.1:${port}/api/v1`,
    requests,
    setRoutes: (r) => {
      routes = r;
    },
    setDefaultChat: (b) => {
      defaultChat = b;
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Seeded byte-boundary reslicer for SSE torture tests (plans/11 §2.1.2). */
export function resliceBuffer(buf: Buffer, seed: number, parts: number): Buffer[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const cuts = new Set<number>([0, buf.length]);
  while (cuts.size < parts + 1) {
    cuts.add(1 + Math.floor(rand() * Math.max(1, buf.length - 1)));
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const out: Buffer[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    out.push(buf.subarray(sorted[i]!, sorted[i + 1]!));
  }
  return out;
}
