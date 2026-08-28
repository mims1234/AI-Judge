import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { POST as postGenerate } from "@/app/api/bundles/generate/route";
import { POST as postBundles } from "@/app/api/bundles/route";
import { GET as getBundle, PUT as putBundle } from "@/app/api/bundles/[id]/route";
import { POST as publishBundle } from "@/app/api/bundles/[id]/publish/route";
import { POST as postRuns } from "@/app/api/runs/route";
import { POST as cancelRun } from "@/app/api/runs/[id]/cancel/route";
import { CUSTOM_JSON_FOOTER } from "@/lib/bundles/custom";
import { prepare } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { finalizeRun } from "@/lib/scoring";
import { createCustomDraft, publishCustomDraft } from "@/lib/server/customBundles";
import { setTestSession } from "@/lib/server/session";
import { upsertUser, type AppUser } from "@/lib/server/users";
import { FOUNDING_ADMIN_DISCORD_ID } from "@/lib/staff";
import { iterateSseFrames } from "@/lib/sse-parse";
import { startMockOpenRouter } from "@/tests/integration/helpers/mock-openrouter";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

const SENTINEL = "sk-or-v1-SENTINEL-DO-NOT-STORE-xyz";

function sampleTasks() {
  return [
    {
      category: "coding" as const,
      task_body:
        "Write a function that reverses a Unicode string without splitting surrogate pairs. Explain the algorithm in two short paragraphs.",
      must_mention: ["grapheme"],
      judge_criteria: [
        "Handles surrogate pairs without splitting",
        "Explains the reverse algorithm clearly",
      ],
    },
    {
      category: "math" as const,
      task_body:
        "A cistern holds 120 liters and drains at 4 liters per minute. Compute minutes until empty and show the arithmetic.",
      must_mention: ["cistern-empty"],
      judge_criteria: [
        "Computes minutes until empty correctly",
        "Shows the arithmetic steps",
      ],
    },
  ];
}

function jsonRequest(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function seedModels() {
  const now = Date.now();
  const upsert = prepare(`
    INSERT INTO models_cache (openrouter_id, name, context_length, pricing_json, raw_json, fetched_at)
    VALUES (@id, @name, 128000, @pricing, @raw, @fetched)
    ON CONFLICT(openrouter_id) DO UPDATE SET fetched_at = excluded.fetched_at
  `);
  for (const id of ["mock/cand-a", "mock/judge-1", "mock/judge-2", "mock/judge-3"]) {
    upsert.run({
      id,
      name: id,
      pricing: JSON.stringify({ prompt_usd_per_m: 1, completion_usd_per_m: 2 }),
      raw: JSON.stringify({ supported_parameters: ["response_format"] }),
      fetched: now,
    });
  }
}

type GeneratedPackSse = {
  tasks: Array<{ task_body: string; category: string }>;
};

async function readGenerateSse(res: Response): Promise<{
  events: Array<{ event: string; data: unknown }>;
  complete: GeneratedPackSse | null;
  error: unknown;
}> {
  const events: Array<{ event: string; data: unknown }> = [];
  if (!res.body) return { events, complete: null, error: null };
  for await (const frame of iterateSseFrames(res.body)) {
    let data: unknown = frame.data;
    try {
      data = JSON.parse(frame.data);
    } catch {
      // keep raw
    }
    events.push({ event: frame.event, data });
  }
  const complete = (events.find((e) => e.event === "generate.complete")?.data ??
    null) as GeneratedPackSse | null;
  const error = events.find((e) => e.event === "generate.error")?.data ?? null;
  return { events, complete, error };
}

function user(name: string): AppUser {
  return upsertUser({
    discord_id: `d-${name.toLowerCase()}`,
    username: name,
    avatar_url: null,
  });
}

describe("custom packs", () => {
  let tdb: TestDb;
  let mock: Awaited<ReturnType<typeof startMockOpenRouter>> | null = null;

  afterEach(async () => {
    setTestSession(null);
    if (mock) {
      await mock.close();
      mock = null;
    }
    tdb?.cleanup();
    delete process.env.OPENROUTER_BASE_URL;
    resetEnvCache();
  });

  it("backfills official origin on seeded bundles", () => {
    tdb = createTestDb();
    const rows = prepare(
      `SELECT slug, origin FROM bundles WHERE slug IN ('mini-benchmark-v1','keel-v1')`,
    ).all() as Array<{ slug: string; origin: string }>;
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.origin === "official")).toBe(true);
  });

  it("returns NEEDS_LOGIN for generate and run without a session", async () => {
    tdb = createTestDb();
    const gen = await postGenerate(
      jsonRequest("http://local/api/bundles/generate", {
        slots: [{ category: "coding", prompt: "Harbor" }],
        generator_model_id: "mock/cand-a",
      }),
    );
    expect(gen.status).toBe(401);
    expect(((await gen.json()) as { error: { code: string } }).error.code).toBe(
      "NEEDS_LOGIN",
    );

    const run = await postRuns(
      jsonRequest("http://local/api/runs", {
        bundle_id: "mini-benchmark-v1",
        candidate_model_ids: ["mock/cand-a"],
        judge_pool_model_ids: ["mock/judge-1", "mock/judge-2", "mock/judge-3"],
        categories: ["coding"],
        trials_per_pair: 1,
        candidate_concurrency: 1,
        seed: 1,
        idempotency_key: randomUUID(),
      }),
    );
    expect(run.status).toBe(401);
    expect(((await run.json()) as { error: { code: string } }).error.code).toBe(
      "NEEDS_LOGIN",
    );
  });

  it("draft hash is stable when notes change; publish is immutable", async () => {
    tdb = createTestDb();
    const alice = user("Alice");
    setTestSession(alice);

    const created = await postBundles(
      jsonRequest("http://local/api/bundles", {
        name: "Harbor pack",
        brief: "Harbor theme",
        reference_notes: "notes v1",
        tasks: sampleTasks(),
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      bundle: { id: string; content_hash: string; status: string };
    };
    expect(createdBody.bundle.status).toBe("draft");
    const hash1 = createdBody.bundle.content_hash;

    const updated = await putBundle(
      jsonRequest("http://local/api/bundles/x", {
        reference_notes: "notes v2 should not enter the hash",
      }),
      { params: Promise.resolve({ id: createdBody.bundle.id }) },
    );
    expect(updated.status).toBe(200);
    const updatedBody = (await updated.json()) as {
      bundle: { content_hash: string };
    };
    expect(updatedBody.bundle.content_hash).toBe(hash1);

    const published = await publishBundle(
      new Request("http://local/api/bundles/x/publish", { method: "POST" }),
      { params: Promise.resolve({ id: createdBody.bundle.id }) },
    );
    expect(published.status).toBe(200);
    const pubBody = (await published.json()) as {
      bundle: { status: string; version: string; id: string };
    };
    expect(pubBody.bundle.status).toBe("published");
    expect(pubBody.bundle.version).toBe("1.0.0");

    const locked = await putBundle(
      jsonRequest("http://local/api/bundles/x", { name: "Nope" }),
      { params: Promise.resolve({ id: pubBody.bundle.id }) },
    );
    expect(locked.status).toBe(403);
  });

  it("rejects publish when a must-mention leaks into the body", () => {
    tdb = createTestDb();
    const alice = user("Alice");
    const draft = createCustomDraft({
      authorId: alice.id,
      name: "Leaky pack",
      brief: "Harbor",
      reference_notes: "",
      generator_model_id: null,
      tasks: [
        {
          category: "coding",
          task_body:
            "Please mention the secret phrase UNIQUEPHRASE in the body, and write at least two sentences so this prompt is not considered short.",
          must_mention: ["UNIQUEPHRASE"],
          judge_criteria: [
            "Handles the required phrase as a hidden check",
            "Explains the approach clearly",
          ],
        },
      ],
    });
    expect(draft.status).toBe("draft");
    try {
      publishCustomDraft(draft.id, alice.id);
      expect.unreachable("publish should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/answer leak/i);
      expect((err as { code?: string }).code).toBe("VALIDATION_ERROR");
    }
    const row = prepare(`SELECT status FROM bundles WHERE id = ?`).get(
      draft.id,
    ) as { status: string };
    expect(row.status).toBe("draft");
  });

  it("A publishes, B can launch a run, B cannot edit", async () => {
    tdb = createTestDb();
    seedModels();
    mock = await startMockOpenRouter();
    process.env.OPENROUTER_BASE_URL = mock.url;
    resetEnvCache();

    const alice = user("Alice");
    const bob = user("Bob");
    setTestSession(alice);

    const created = await postBundles(
      jsonRequest("http://local/api/bundles", {
        name: "Shared pack",
        brief: "Shared",
        tasks: sampleTasks(),
      }),
    );
    const { bundle } = (await created.json()) as {
      bundle: { id: string; slug: string };
    };
    const published = await publishBundle(
      new Request("http://local/publish", { method: "POST" }),
      { params: Promise.resolve({ id: bundle.id }) },
    );
    expect(published.status).toBe(200);

    setTestSession(bob);
    const edit = await putBundle(
      jsonRequest("http://local/api/bundles/x", { name: "Stolen" }),
      { params: Promise.resolve({ id: bundle.id }) },
    );
    expect(edit.status).toBe(403);

    const launch = await postRuns(
      jsonRequest("http://local/api/runs", {
        bundle_id: bundle.id,
        candidate_model_ids: ["mock/cand-a"],
        judge_pool_model_ids: ["mock/judge-1", "mock/judge-2", "mock/judge-3"],
        categories: ["coding", "math"],
        trials_per_pair: 1,
        candidate_concurrency: 1,
        seed: 7,
        idempotency_key: randomUUID(),
      }),
    );
    expect(launch.status).toBe(201);
    const launched = (await launch.json()) as { run_id: string };
    const row = prepare(
      `SELECT launched_by_user_id FROM runs WHERE id = ?`,
    ).get(launched.run_id) as { launched_by_user_id: string };
    expect(row.launched_by_user_id).toBe(bob.id);

    await cancelRun(
      new Request("http://local/cancel", { method: "POST" }),
      { params: Promise.resolve({ id: launched.run_id }) },
    );
  });

  it("keeps the sentinel key out of SQLite after generate + draft", async () => {
    tdb = createTestDb();
    seedModels();
    mock = await startMockOpenRouter();
    mock.setDefaultChat({
      kind: "sse",
      fixtureRelPath: "sse/custom-pack-generate.sse",
    });
    process.env.OPENROUTER_BASE_URL = mock.url;
    resetEnvCache();

    const alice = user("Alice");
    setTestSession(alice);

    const gen = await postGenerate(
      jsonRequest(
        "http://local/api/bundles/generate",
        {
          slots: [
            {
              category: "coding",
              prompt: "Harbor logistics puzzle — write a routing function.",
            },
            {
              category: "math",
              prompt: "Harbor logistics puzzle — compute drain time.",
            },
          ],
          generator_model_id: "mock/cand-a",
        },
        { "x-openrouter-key": SENTINEL },
      ),
    );
    expect(gen.status).toBe(200);
    expect(gen.headers.get("content-type") ?? "").toMatch(/text\/event-stream/);
    const streamed = await readGenerateSse(gen);
    expect(streamed.error).toBeNull();
    expect(streamed.events.some((e) => e.event === "generate.delta")).toBe(true);
    expect(streamed.complete?.tasks).toHaveLength(2);
    const pack = streamed.complete!;
    expect(pack.tasks.every((t) => t.task_body.includes(CUSTOM_JSON_FOOTER))).toBe(
      true,
    );

    const created = await postBundles(
      jsonRequest(
        "http://local/api/bundles",
        {
          name: "Sentinel pack",
          brief: "Harbor logistics puzzle",
          tasks: pack.tasks.map((t) => ({
            category: t.category,
            task_body: t.task_body,
            must_mention: ["grapheme"],
          })),
        },
        { "x-openrouter-key": SENTINEL },
      ),
    );
    expect(created.status).toBe(201);

    const raw = fs.readFileSync(tdb.path);
    expect(raw.includes(SENTINEL)).toBe(false);
  });

  it("complete badge is exact category-set match", () => {
    tdb = createTestDb();
    const alice = user("Alice");
    setTestSession(alice);

    const draft = createCustomDraft({
      authorId: alice.id,
      name: "Two type pack",
      brief: "brief",
      reference_notes: "",
      generator_model_id: null,
      tasks: sampleTasks(),
    });
    const published = publishCustomDraft(draft.id, alice.id);
    const tasks = prepare(
      `SELECT id, category FROM tasks WHERE bundle_id = ?`,
    ).all(published.id) as Array<{ id: string; category: string }>;

    function insertCompleted(categories: string[]) {
      const runId = randomUUID();
      prepare(
        `INSERT INTO runs (
          id, bundle_id, bundle_hash, seed, status, parameters_json,
          budget_usd, trials, total_cost_usd, last_event_id, created_at
        ) VALUES (?, ?, ?, 1, 'completed', ?, NULL, 1, 0, 0, ?)`,
      ).run(
        runId,
        published.id,
        published.content_hash,
        JSON.stringify({
          categories,
          bundle_categories: ["coding", "math"],
        }),
        Date.now(),
      );
      prepare(`INSERT INTO run_candidates (run_id, model_id) VALUES (?, ?)`).run(
        runId,
        "mock/cand-a",
      );
      for (const cat of categories) {
        const task = tasks.find((t) => t.category === cat)!;
        const trId = randomUUID();
        prepare(
          `INSERT INTO task_results (
            id, run_id, task_id, candidate_model_id, trial_index, status
          ) VALUES (?, ?, ?, 'mock/cand-a', 0, 'scored')`,
        ).run(trId, runId, task.id);
        prepare(
          `INSERT INTO task_scores (
            id, task_result_id, run_id, task_id, category, candidate_model_id,
            trial_index, judgment_ids_json, judge_overalls_json, median_overall,
            disagreement, validators_passed, validators_total, created_at
          ) VALUES (?, ?, ?, ?, ?, 'mock/cand-a', 0, '[]', ?, 8, 0, 1, 1, ?)`,
        ).run(randomUUID(), trId, runId, task.id, cat, JSON.stringify([8]), Date.now());
      }
      return runId;
    }

    const full = insertCompleted(["coding", "math"]);
    expect(finalizeRun(full).complete).toBe(true);

    const partial = insertCompleted(["coding"]);
    expect(finalizeRun(partial).complete).toBe(false);
  });

  it("hides unpublished drafts from anyone but the owner", async () => {
    tdb = createTestDb();
    const alice = user("Alice");
    const bob = user("Bob");
    setTestSession(alice);

    const created = await postBundles(
      jsonRequest("http://local/api/bundles", {
        name: "Private draft",
        brief: "Harbor",
        tasks: sampleTasks(),
      }),
    );
    const { bundle } = (await created.json()) as { bundle: { id: string } };

    const asOwner = await getBundle(
      new Request("http://local/api/bundles/x"),
      { params: Promise.resolve({ id: bundle.id }) },
    );
    expect(asOwner.status).toBe(200);

    setTestSession(bob);
    const asBob = await getBundle(
      new Request("http://local/api/bundles/x"),
      { params: Promise.resolve({ id: bundle.id }) },
    );
    expect(asBob.status).toBe(404);

    setTestSession(null);
    const anon = await getBundle(
      new Request("http://local/api/bundles/x"),
      { params: Promise.resolve({ id: bundle.id }) },
    );
    expect(anon.status).toBe(404);
  });

  it("accepts two coding tasks with different prompts on draft update", async () => {
    tdb = createTestDb();
    const alice = user("Alice");
    setTestSession(alice);

    const created = await postBundles(
      jsonRequest("http://local/api/bundles", {
        name: "Repeat types",
        brief: "Harbor",
        tasks: sampleTasks(),
      }),
    );
    const { bundle } = (await created.json()) as { bundle: { id: string } };

    const dup = await putBundle(
      jsonRequest("http://local/api/bundles/x", {
        tasks: [
          {
            category: "coding",
            task_body:
              "Write a function that reverses a Unicode string without splitting surrogate pairs. Explain the algorithm in two short paragraphs.",
            must_mention: ["grapheme"],
          },
          {
            category: "coding",
            task_body:
              "Write a function that merges two interval lists without overlapping ranges. Explain the algorithm in two short paragraphs.",
            must_mention: ["interval"],
          },
        ],
      }),
      { params: Promise.resolve({ id: bundle.id }) },
    );
    expect(dup.status).toBe(200);
    const rows = prepare(
      `SELECT category FROM tasks WHERE bundle_id = ? ORDER BY rowid ASC`,
    ).all(bundle.id) as Array<{ category: string }>;
    expect(rows.map((r) => r.category)).toEqual(["coding", "coding"]);
  });

  it("scopes idempotency keys to the launching user", async () => {
    tdb = createTestDb();
    seedModels();
    mock = await startMockOpenRouter();
    process.env.OPENROUTER_BASE_URL = mock.url;
    resetEnvCache();

    const alice = user("Alice");
    const bob = user("Bob");
    setTestSession(alice);

    const draft = createCustomDraft({
      authorId: alice.id,
      name: "Shared run pack",
      brief: "brief",
      reference_notes: "",
      generator_model_id: null,
      tasks: sampleTasks(),
    });
    const published = publishCustomDraft(draft.id, alice.id);
    const key = randomUUID();
    const body = {
      bundle_id: published.id,
      candidate_model_ids: ["mock/cand-a"],
      judge_pool_model_ids: ["mock/judge-1", "mock/judge-2", "mock/judge-3"],
      categories: ["coding", "math"],
      trials_per_pair: 1,
      candidate_concurrency: 1,
      seed: 3,
      idempotency_key: key,
    };

    const first = await postRuns(jsonRequest("http://local/api/runs", body));
    expect(first.status).toBe(201);
    const aliceRun = (await first.json()) as { run_id: string; status: string };

    setTestSession(bob);
    const second = await postRuns(jsonRequest("http://local/api/runs", body));
    expect(second.status).toBe(201);
    const bobRun = (await second.json()) as { run_id: string };
    expect(bobRun.run_id).not.toBe(aliceRun.run_id);

    setTestSession(alice);
    const replay = await postRuns(jsonRequest("http://local/api/runs", body));
    expect(replay.status).toBe(201);
    const again = (await replay.json()) as { run_id: string; status: string };
    expect(again.run_id).toBe(aliceRun.run_id);
    const stored = prepare(`SELECT status FROM runs WHERE id = ?`).get(
      aliceRun.run_id,
    ) as { status: string };
    expect(again.status).toBe(stored.status);

    await cancelRun(
      new Request("http://local/cancel", { method: "POST" }),
      { params: Promise.resolve({ id: aliceRun.run_id }) },
    );
    setTestSession(bob);
    await cancelRun(
      new Request("http://local/cancel", { method: "POST" }),
      { params: Promise.resolve({ id: bobRun.run_id }) },
    );
  });

  it("denies control of legacy runs with no launcher", async () => {
    tdb = createTestDb();
    const alice = user("Alice");
    setTestSession(alice);
    const bundle = prepare(
      `SELECT id FROM bundles WHERE slug = 'mini-benchmark-v1'`,
    ).get() as { id: string };
    const runId = randomUUID();
    prepare(
      `INSERT INTO runs (
        id, bundle_id, bundle_hash, seed, status, parameters_json,
        budget_usd, trials, total_cost_usd, last_event_id, created_at,
        launched_by_user_id
      ) VALUES (?, ?, 'hash', 1, 'queued', '{}', NULL, 1, 0, 0, ?, NULL)`,
    ).run(runId, bundle.id, Date.now());

    const res = await cancelRun(
      new Request("http://local/cancel", { method: "POST" }),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(res.status).toBe(403);

    const staff = upsertUser({
      discord_id: FOUNDING_ADMIN_DISCORD_ID,
      username: "Staff",
      avatar_url: null,
    });
    setTestSession(staff);
    const staffRes = await cancelRun(
      new Request("http://local/cancel", { method: "POST" }),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(staffRes.status).toBe(200);
  });
});
