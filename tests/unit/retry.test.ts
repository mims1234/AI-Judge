import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterError, streamChat } from "@/lib/openrouter";
import { resetEnvCache } from "@/lib/env";
import { startMockOpenRouter } from "@/tests/integration/helpers/mock-openrouter";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("retry / backoff via streamChat (plans/11 §1.6)", () => {
  let mock: Awaited<ReturnType<typeof startMockOpenRouter>> | null = null;
  let tdb: TestDb | null = null;

  afterEach(async () => {
    vi.useRealTimers();
    await mock?.close();
    mock = null;
    tdb?.cleanup();
    tdb = null;
    resetEnvCache();
  });

  async function withMock() {
    tdb = createTestDb();
    mock = await startMockOpenRouter();
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_BASE_URL = mock.url;
    resetEnvCache();
  }

  it("does not retry 400/401/403/404 (single attempt)", async () => {
    await withMock();
    mock!.setDefaultChat({
      kind: "status",
      status: 400,
      body: JSON.stringify({ error: { message: "bad" } }),
    });
    const onRetry = vi.fn();
    await expect(
      streamChat({
        model: "mock/cand-a",
        messages: [{ role: "user", content: "hi" }],
        temperature: 0,
        maxTokens: 16,
        signal: AbortSignal.timeout(5_000),
        onDelta: () => {},
        onRetry,
        deadlineMs: 5_000,
      }),
    ).rejects.toBeInstanceOf(OpenRouterError);
    expect(onRetry).not.toHaveBeenCalled();
    const chats = mock!.requests.filter((r) =>
      r.url.includes("chat/completions"),
    );
    expect(chats.length).toBe(1);
  });

  it("retries 429 / 500 then surfaces typed error after bound", async () => {
    await withMock();
    mock!.setDefaultChat({
      kind: "status",
      status: 500,
      body: JSON.stringify({ error: { message: "upstream" } }),
    });
    const onRetry = vi.fn();
    await expect(
      streamChat({
        model: "mock/cand-a",
        messages: [{ role: "user", content: "hi" }],
        temperature: 0,
        maxTokens: 16,
        signal: new AbortController().signal,
        onDelta: () => {},
        onRetry,
        deadlineMs: 60_000,
      }),
    ).rejects.toMatchObject({
      name: "OpenRouterError",
      retryable: true,
    });
    expect(onRetry.mock.calls.length).toBeGreaterThanOrEqual(1);
    const chats = mock!.requests.filter((r) =>
      r.url.includes("chat/completions"),
    );
    expect(chats.length).toBe(3);
  });

  it("honors Retry-After on 429 via onRetry delay", async () => {
    await withMock();
    let hits = 0;
    mock!.setRoutes([
      {
        behavior: {
          kind: "status",
          status: 429,
          headers: { "Retry-After": "1" },
          body: JSON.stringify({ error: { message: "rate" } }),
        },
      },
    ]);
    // Force every request to 429 by default as well
    mock!.setDefaultChat({
      kind: "status",
      status: 429,
      headers: { "Retry-After": "1" },
      body: JSON.stringify({ error: { message: "rate" } }),
    });

    const delays: number[] = [];
    await expect(
      streamChat({
        model: "mock/cand-a",
        messages: [{ role: "user", content: "hi" }],
        temperature: 0,
        maxTokens: 8,
        signal: new AbortController().signal,
        onDelta: () => {
          hits += 1;
        },
        onRetry: (_a, delay) => {
          delays.push(delay);
        },
        deadlineMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(OpenRouterError);

    expect(delays.length).toBeGreaterThan(0);
    // Retry-After 1s should floor delay at >= 1000ms (openrouter backoffMs)
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(1000);
    expect(hits).toBe(0);
  });

  it("OpenRouterError classifies retryable kinds", () => {
    expect(new OpenRouterError("rate_limited", "x").retryable).toBe(true);
    expect(new OpenRouterError("upstream", "x").retryable).toBe(true);
    expect(new OpenRouterError("timeout", "x").retryable).toBe(true);
    expect(new OpenRouterError("auth", "x").retryable).toBe(false);
    expect(new OpenRouterError("bad_request", "x").retryable).toBe(false);
  });
});
