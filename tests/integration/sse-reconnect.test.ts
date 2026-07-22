import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prepare } from "@/lib/db";
import { getRunEngine, resetRunEngineForTests } from "@/lib/run-engine";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

/**
 * Durable Last-Event-ID replay (plans/11 §2.4).
 * Exercises the engine event log + SQL ordering rather than the HTTP route,
 * so the suite stays process-local and fast.
 */
describe("SSE Last-Event-ID replay (plans/11 §2.4)", () => {
  let tdb: TestDb;

  afterEach(() => {
    tdb?.cleanup();
  });

  function seedRun(): string {
    tdb = createTestDb();
    const bundle = prepare(
      `SELECT id FROM bundles WHERE slug = 'mini-benchmark-v1'`,
    ).get() as { id: string };
    const runId = randomUUID();
    // Use completed so recover() does not re-execute the run during getRunEngine().
    prepare(
      `INSERT INTO runs (
        id, bundle_id, bundle_hash, seed, status, parameters_json,
        budget_usd, trials, total_cost_usd, last_event_id, created_at, finished_at
      ) VALUES (?, ?, 'hash', 1, 'completed', '{}', NULL, 1, 0, 0, ?, ?)`,
    ).run(runId, bundle.id, Date.now(), Date.now());
    return runId;
  }

  function replay(runId: string, lastEventId: number) {
    return prepare(
      `SELECT id, type, payload FROM run_events
       WHERE run_id = ? AND id > ?
       ORDER BY id ASC`,
    ).all(runId, lastEventId) as Array<{
      id: number;
      type: string;
      payload: string;
    }>;
  }

  it("events get monotonic ids; replay returns id > cursor in order", () => {
    const runId = seedRun();
    const engine = getRunEngine() as unknown as {
      emitEvent: (runId: string, type: string, payload: unknown) => { id?: number };
    };

    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const evt = engine.emitEvent(runId, "notice", { i });
      expect(evt.id).toBeTypeOf("number");
      ids.push(evt.id!);
    }
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]!).toBeGreaterThan(ids[i - 1]!);
    }

    const from2 = replay(runId, ids[1]!);
    expect(from2.map((e) => e.id)).toEqual(ids.slice(2));
  });

  it("replay survives engine in-memory restart (SQLite durable)", () => {
    const runId = seedRun();
    const engine = getRunEngine() as unknown as {
      emitEvent: (runId: string, type: string, payload: unknown) => { id?: number };
    };
    engine.emitEvent(runId, "run.started", { runId });
    engine.emitEvent(runId, "notice", { n: 1 });
    const last = engine.emitEvent(runId, "notice", { n: 2 }).id!;

    resetRunEngineForTests();
    // New engine instance — DB file unchanged
    getRunEngine();

    const rows = replay(runId, 0);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[rows.length - 1]!.id).toBe(last);
    expect(replay(runId, last)).toEqual([]);
  });

  it("malformed cursor treated as 0 → full replay", () => {
    const runId = seedRun();
    const engine = getRunEngine() as unknown as {
      emitEvent: (runId: string, type: string, payload: unknown) => void;
    };
    engine.emitEvent(runId, "notice", { a: 1 });
    engine.emitEvent(runId, "notice", { a: 2 });

    const raw = Number("not-a-number");
    const cursor = Number.isFinite(raw) ? raw : 0;
    expect(replay(runId, cursor).length).toBe(2);
  });
});
