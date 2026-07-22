import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OpenRouterError, streamChat } from "@/lib/openrouter";
import { resetEnvCache } from "@/lib/env";
import {
  resliceBuffer,
  startMockOpenRouter,
} from "@/tests/integration/helpers/mock-openrouter";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("OpenRouter SSE stream parsing (plans/11 §2.1)", () => {
  let mock: Awaited<ReturnType<typeof startMockOpenRouter>> | null = null;
  let tdb: TestDb | null = null;

  afterEach(async () => {
    await mock?.close();
    mock = null;
    tdb?.cleanup();
    tdb = null;
    resetEnvCache();
  });

  async function boot(fixture = "sse/candidate-stream-happy.sse") {
    tdb = createTestDb();
    mock = await startMockOpenRouter();
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_BASE_URL = mock.url;
    resetEnvCache();
    mock.setDefaultChat({ kind: "sse", fixtureRelPath: fixture, chunkBytes: 17 });
  }

  it("happy path reassembles text and captures usage", async () => {
    await boot();
    let text = "";
    const result = await streamChat({
      model: "mock/cand-a",
      messages: [{ role: "user", content: "go" }],
      temperature: 0,
      maxTokens: 256,
      signal: AbortSignal.timeout(15_000),
      onDelta: (d) => {
        text += d;
      },
      deadlineMs: 15_000,
    });
    const expected = fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/candidates/math/valid-1.txt"),
      "utf8",
    );
    expect(result.text).toBe(expected);
    expect(text).toBe(expected);
    expect(result.finish_reason).toBe("stop");
    expect(result.usage.prompt_tokens).toBeGreaterThan(0);
    expect(result.usage.completion_tokens).toBeGreaterThan(0);
    expect(result.usage.cost_usd).toBeGreaterThan(0);
  });

  it("chunk-boundary torture parses identically", async () => {
    await boot("sse/candidate-stream-split-utf8.sse");
    // Force tiny chunks via mock
    mock!.setDefaultChat({
      kind: "sse",
      fixtureRelPath: "sse/candidate-stream-split-utf8.sse",
      chunkBytes: 3,
    });
    const result = await streamChat({
      model: "mock/cand-a",
      messages: [{ role: "user", content: "utf8" }],
      temperature: 0,
      maxTokens: 64,
      signal: AbortSignal.timeout(15_000),
      onDelta: () => {},
      deadlineMs: 15_000,
    });
    expect(result.text).toContain("café");
    expect(result.text).toContain("日本語");

    // reslicer utility itself is deterministic
    const buf = fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/sse/candidate-stream-happy.sse"),
    );
    const parts = resliceBuffer(buf, 12345, 12);
    expect(Buffer.concat(parts).equals(buf)).toBe(true);
  });

  it("keepalive comments are ignored", async () => {
    await boot();
    const result = await streamChat({
      model: "mock/cand-a",
      messages: [{ role: "user", content: "k" }],
      temperature: 0,
      maxTokens: 64,
      signal: AbortSignal.timeout(15_000),
      onDelta: () => {},
      deadlineMs: 15_000,
    });
    expect(result.text.includes("keepalive")).toBe(false);
  });

  it("mid-stream provider error becomes typed failure", async () => {
    await boot("sse/stream-with-error-event.sse");
    await expect(
      streamChat({
        model: "mock/cand-a",
        messages: [{ role: "user", content: "err" }],
        temperature: 0,
        maxTokens: 64,
        signal: AbortSignal.timeout(15_000),
        onDelta: () => {},
        deadlineMs: 15_000,
        allowRetryAfterPartial: false,
      }),
    ).rejects.toBeInstanceOf(OpenRouterError);
  });

  it("socket drop is retryable infrastructure failure", async () => {
    await boot();
    mock!.setDefaultChat({ kind: "drop" });
    await expect(
      streamChat({
        model: "mock/cand-a",
        messages: [{ role: "user", content: "drop" }],
        temperature: 0,
        maxTokens: 32,
        signal: new AbortController().signal,
        onDelta: () => {},
        deadlineMs: 30_000,
        allowRetryAfterPartial: true,
      }),
    ).rejects.toBeInstanceOf(OpenRouterError);
  });
});
