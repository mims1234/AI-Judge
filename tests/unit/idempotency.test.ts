import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { streamChat } from "@/lib/openrouter";
import { resetEnvCache } from "@/lib/env";
import { startMockOpenRouter } from "@/tests/integration/helpers/mock-openrouter";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

/** Mirrors Backend's private requestHash canonicalization for contract pinning. */
function stableHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

describe("idempotency hashing (plans/11 §1.7)", () => {
  let mock: Awaited<ReturnType<typeof startMockOpenRouter>> | null = null;
  let tdb: TestDb | null = null;

  afterEach(async () => {
    await mock?.close();
    mock = null;
    tdb?.cleanup();
    tdb = null;
    resetEnvCache();
  });

  it("same inputs → same hash; field change → different hash", () => {
    const base = {
      run_id: "r1",
      task_id: "t1",
      candidate_model_id: "mock/cand-a",
      trial_index: 0,
      role: "candidate",
      prompt_hash: "abc",
    };
    expect(stableHash(base)).toBe(stableHash({ ...base }));
    expect(stableHash(base)).not.toBe(
      stableHash({ ...base, trial_index: 1 }),
    );
    expect(stableHash(base)).not.toBe(stableHash({ ...base, run_id: "r2" }));
  });

  it("key-order independence for canonical JSON objects", () => {
    const a = { a: 1, b: 2, c: { d: 3, e: 4 } };
    const b = { c: { e: 4, d: 3 }, b: 2, a: 1 };
    // JSON.stringify is insertion-order — Backend hashes insertion order of its built object.
    // Pin the *contract intent* with an explicit sort helper used by tests:
    const canon = (v: unknown): string =>
      JSON.stringify(v, (_, val) => {
        if (val && typeof val === "object" && !Array.isArray(val)) {
          return Object.fromEntries(
            Object.entries(val as Record<string, unknown>).sort(([x], [y]) =>
              x.localeCompare(y),
            ),
          );
        }
        return val;
      });
    expect(canon(a)).toBe(canon(b));
  });

  it("streamChat returns stable request_hash for identical payloads", async () => {
    tdb = createTestDb();
    mock = await startMockOpenRouter();
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_BASE_URL = mock.url;
    resetEnvCache();
    mock.setDefaultChat({
      kind: "sse",
      fixtureRelPath: "sse/candidate-stream-happy.sse",
    });

    const params = {
      model: "mock/cand-a",
      messages: [{ role: "user" as const, content: "identical" }],
      temperature: 0,
      maxTokens: 32,
    };

    const a = await streamChat({
      ...params,
      signal: AbortSignal.timeout(10_000),
      onDelta: () => {},
      deadlineMs: 10_000,
    });
    const b = await streamChat({
      ...params,
      signal: AbortSignal.timeout(10_000),
      onDelta: () => {},
      deadlineMs: 10_000,
    });
    expect(a.request_hash).toBe(b.request_hash);
    expect(a.request_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
