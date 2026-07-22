/**
 * Dev-only fixture recorder (plans/11 §4 / README-QUALITY).
 * Hits real OpenRouter with the local key — NEVER run in CI.
 *
 * Usage:
 *   npx tsx scripts/record-fixture.ts --kind candidate --category math --model <id>
 *   npx tsx scripts/record-fixture.ts --kind judge --model <id>
 *   npx tsx scripts/record-fixture.ts --kind sse --label candidate-stream-custom
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "./env";

loadEnvLocal();

function arg(name: string, fallback?: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) {
    if (fallback != null) return fallback;
    throw new Error(`Missing --${name}`);
  }
  const v = process.argv[idx + 1];
  if (!v) throw new Error(`Missing value for --${name}`);
  return v;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  if (process.env.CI === "true" || hasFlag("ci")) {
    throw new Error("record-fixture must not run in CI");
  }

  const kind = arg("kind");
  const outRoot = path.join(process.cwd(), "tests/fixtures");
  const key = process.env.OPENROUTER_API_KEY;
  const base = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(
    /\/$/,
    "",
  );
  if (!key) throw new Error("OPENROUTER_API_KEY required");

  if (kind === "candidate") {
    const category = arg("category");
    const model = arg("model");
    const prompt = arg("prompt", `Produce a valid JSON answer for the ${category} benchmark task.`);
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    const dest = path.join(outRoot, "candidates", category, `recorded-${Date.now()}.txt`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text);
    console.log("wrote", dest);
    return;
  }

  if (kind === "judge") {
    const model = arg("model");
    const prompt = arg("prompt", "Return only valid judge JSON for a math answer free=552 paid=432.");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    const dest = path.join(outRoot, "judges", `recorded-${Date.now()}.txt`);
    fs.writeFileSync(dest, text);
    console.log("wrote", dest);
    return;
  }

  if (kind === "sse") {
    console.log(
      "SSE byte recording: use a local proxy or browser Network export, then place the raw bytes under tests/fixtures/sse/.",
    );
    console.log("Label hint:", arg("label", "custom"));
    return;
  }

  throw new Error(`Unknown --kind ${kind}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
