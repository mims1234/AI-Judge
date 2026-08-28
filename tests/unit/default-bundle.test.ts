import { afterEach, describe, expect, it } from "vitest";
import { getDefaultBundle } from "@/lib/server/bundles";
import { createCustomDraft, publishCustomDraft } from "@/lib/server/customBundles";
import { prepare } from "@/lib/db";
import { upsertUser } from "@/lib/server/users";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("getDefaultBundle", () => {
  let tdb: TestDb;
  afterEach(() => tdb?.cleanup());

  it("falls back to the oldest published official instrument", () => {
    tdb = createTestDb();
    const alice = upsertUser({
      discord_id: "d-alice",
      username: "Alice",
      avatar_url: null,
    });
    const draft = createCustomDraft({
      authorId: alice.id,
      name: "Older custom",
      brief: "Harbor",
      reference_notes: "",
      generator_model_id: null,
      tasks: [
        {
          category: "coding",
          task_body:
            "Write a function that reverses a Unicode string without splitting surrogate pairs. Explain the algorithm in two short paragraphs.",
          must_mention: ["grapheme"],
        },
      ],
    });
    const published = publishCustomDraft(draft.id, alice.id);
    prepare(`UPDATE bundles SET created_at = 1 WHERE id = ?`).run(published.id);
    prepare(
      `UPDATE bundles SET status = 'deprecated' WHERE slug = 'mini-benchmark-v1'`,
    ).run();

    const fallback = getDefaultBundle();
    expect(fallback?.origin).toBe("official");
    expect(fallback?.slug).toBe("keel-v1");
  });
});
