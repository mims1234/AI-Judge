/**
 * Boots mock OpenRouter + next dev for Playwright webServer (plans/11 §3).
 * Keeps both processes alive until SIGINT/SIGTERM.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const FIXTURES = path.join(root, "tests/fixtures");
const mockPort = Number(process.env.AI_JUDGE_MOCK_PORT ?? 4099);
const nextPort = Number(process.env.PORT ?? 3000);
const dbPath = path.join(root, "data", "e2e-ai-judge.sqlite");

function readFixture(rel) {
  return fs.readFileSync(path.join(FIXTURES, rel));
}

function startMock() {
  const models = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, "models/list.json"), "utf8"),
  );

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString("utf8");
    const url = req.url ?? "/";

    if (req.method === "GET" && url.includes("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(models));
      return;
    }

    if (req.method === "POST" && url.includes("/chat/completions")) {
      const isJudge =
        body.includes("independent benchmark judge") ||
        body.includes('"name":"judgment"') ||
        body.toLowerCase().includes("judge");
      const fixture = isJudge
        ? "sse/judge-stream-happy.sse"
        : "sse/candidate-stream-happy.sse";
      const buf = readFixture(fixture);
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      // Stream in small chunks so the client parser exercises framing.
      let offset = 0;
      const chunk = 48;
      const pump = () => {
        if (offset >= buf.length) {
          res.end();
          return;
        }
        const end = Math.min(buf.length, offset + chunk);
        res.write(buf.subarray(offset, end));
        offset = end;
        setTimeout(pump, 2);
      };
      pump();
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  return new Promise((resolve) => {
    server.listen(mockPort, "127.0.0.1", () => {
      console.log(`[e2e-stack] mock OpenRouter on http://127.0.0.1:${mockPort}/api/v1`);
      resolve(server);
    });
  });
}

async function main() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  // Fresh e2e DB each boot
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(dbPath + suffix, { force: true });
    } catch {
      /* ignore */
    }
  }

  const mock = await startMock();

  const env = {
    ...process.env,
    OPENROUTER_API_KEY: "test-key",
    OPENROUTER_BASE_URL: `http://127.0.0.1:${mockPort}/api/v1`,
    DATABASE_PATH: dbPath.replace(/\\/g, "/"),
    PORT: String(nextPort),
  };

  const nextBin = path.join(
    root,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(nextPort)], {
    cwd: root,
    env,
    stdio: "inherit",
  });

  const shutdown = () => {
    child.kill("SIGTERM");
    mock.close();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  child.on("exit", (code) => {
    mock.close();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
