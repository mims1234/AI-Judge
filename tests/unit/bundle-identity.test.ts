import { afterEach, describe, expect, it } from "vitest";
import { KEEL_V1, keelContentHash } from "@/lib/bundles/keel-v1";
import {
  CATEGORIES,
  MATH_GROUND_TRUTH,
  MINI_V1,
  computeContentHash,
} from "@/lib/bundles/mini-v1";
import { prepare } from "@/lib/db";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

/**
 * Pins Octant + Keel identities (plans/02, plans/13, plans/14).
 * Silent prompt edits or a missing seed migration must fail CI.
 */
describe("bundle identity — Octant / mini-benchmark-v1 (plans/13)", () => {
  it("keeps stable slug, name, and version", () => {
    expect(MINI_V1.slug).toBe("mini-benchmark-v1");
    expect(MINI_V1.name).toBe("mini-benchmark");
    expect(MINI_V1.version).toBe("1.0.0");
    expect(MINI_V1.status).toBe("published");
  });

  it("ships all eight equal-weight categories", () => {
    expect([...CATEGORIES].sort()).toEqual([
      "coding",
      "judging",
      "marketing",
      "math",
      "poster",
      "research",
      "roleplay",
      "story",
    ]);
    expect(MINI_V1.tasks).toHaveLength(8);
    for (const t of MINI_V1.tasks) {
      expect(t.weight).toBe(1.0);
    }
  });

  it("pins math ground truth 552 / 432", () => {
    expect(MATH_GROUND_TRUTH.free_users_after_month_1).toBe(552);
    expect(MATH_GROUND_TRUTH.paid_users_after_month_1).toBe(432);
  });

  it("pins canonical content hash", () => {
    expect(computeContentHash()).toBe(
      "1e48022acec0490191d61ffba3a1772a2700f07a521f92d17d58e2be1123fbdd",
    );
  });
});

describe("bundle identity — Keel / keel-v1 (plans/13–14)", () => {
  it("has distinct published metadata", () => {
    expect(KEEL_V1.slug).toBe("keel-v1");
    expect(KEEL_V1.name).toBe("keel");
    expect(KEEL_V1.version).toBe("1.0.0");
    expect(KEEL_V1.status).toBe("published");
    expect(KEEL_V1.tasks).toHaveLength(8);
  });

  it("pins a content hash different from Octant", () => {
    const keelHash = keelContentHash();
    expect(keelHash).toBe(
      "44138b368f323c638c5d313c8d838c5ae57d29e32091ed9ac06b6ad6476be4f5",
    );
    expect(keelHash).not.toBe(computeContentHash());
  });

  it("uses different task bodies than Octant for every category", () => {
    for (const category of CATEGORIES) {
      const octant = MINI_V1.tasks.find((t) => t.category === category)!;
      const keel = KEEL_V1.tasks.find((t) => t.category === category)!;
      expect(keel.task_body).not.toBe(octant.task_body);
    }
  });
});

describe("bundle seed — both rows in SQLite (migration 002 + 003)", () => {
  let tdb: TestDb;

  afterEach(() => {
    tdb?.cleanup();
  });

  it("lists both published slugs with matching hashes", () => {
    tdb = createTestDb();
    const rows = prepare(
      `SELECT slug, content_hash, status FROM bundles WHERE slug IN ('mini-benchmark-v1', 'keel-v1') ORDER BY slug`,
    ).all() as Array<{ slug: string; content_hash: string; status: string }>;

    expect(rows).toHaveLength(2);
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
    expect(bySlug["keel-v1"]?.status).toBe("published");
    expect(bySlug["mini-benchmark-v1"]?.status).toBe("published");
    expect(bySlug["keel-v1"]?.content_hash).toBe(keelContentHash());
    expect(bySlug["mini-benchmark-v1"]?.content_hash).toBe(computeContentHash());
  });

  it("keeps task rows isolated per bundle_id", () => {
    tdb = createTestDb();
    const keel = prepare(`SELECT id FROM bundles WHERE slug = 'keel-v1'`).get() as {
      id: string;
    };
    const octant = prepare(
      `SELECT id FROM bundles WHERE slug = 'mini-benchmark-v1'`,
    ).get() as { id: string };
    expect(keel.id).not.toBe(octant.id);

    const keelTasks = prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE bundle_id = ?`,
    ).get(keel.id) as { n: number };
    const octantTasks = prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE bundle_id = ?`,
    ).get(octant.id) as { n: number };
    expect(keelTasks.n).toBe(8);
    expect(octantTasks.n).toBe(8);
  });
});
