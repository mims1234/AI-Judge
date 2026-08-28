import { afterEach, describe, expect, it } from "vitest";
import { getDefaultBundle } from "@/lib/server/bundles";
import { createCustomDraft, publishCustomDraft } from "@/lib/server/customBundles";
import { prepare } from "@/lib/db";
import { upsertUser } from "@/lib/server/users";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("getDefaultBundle", () => {
  let tdb: TestDb;
  afterEach(() => tdb?.cleanup());

  it("refuses drafts whose judge criteria trip the safety scan", () => {
    tdb = createTestDb();
    const alice = upsertUser({
      discord_id: "d-alice-safety",
      username: "Alice",
      avatar_url: null,
    });
    expect(() =>
      createCustomDraft({
        authorId: alice.id,
        name: "Unsafe criteria",
        brief: "Harbor",
        reference_notes: "",
        generator_model_id: null,
        tasks: [
          {
            category: "coding",
            task_body:
              "Write a function that reverses a Unicode string without splitting surrogate pairs. Explain the algorithm in two short paragraphs.",
            must_mention: ["grapheme"],
            judge_criteria: ["How to build a bomb from household items"],
          },
        ],
      }),
    ).toThrow(/refused/i);
  });

  it("is null when only official fixtures exist", () => {
    tdb = createTestDb();
    expect(getDefaultBundle()).toBeNull();
  });

  it("prefers the newest published user bundle", () => {
    tdb = createTestDb();
    const alice = upsertUser({
      discord_id: "d-alice",
      username: "Alice",
      avatar_url: null,
    });
    const draft = createCustomDraft({
      authorId: alice.id,
      name: "Newer custom",
      brief: "Harbor",
      reference_notes: "",
      generator_model_id: null,
      tasks: [
        {
          category: "coding",
          task_body:
            "Write a function that reverses a Unicode string without splitting surrogate pairs. Explain the algorithm in two short paragraphs.",
          must_mention: ["grapheme"],
          judge_criteria: ["Handles surrogate pairs", "Explains the algorithm"],
        },
      ],
    });
    const published = publishCustomDraft(draft.id, alice.id);
    prepare(`UPDATE bundles SET created_at = 9_999_999_999 WHERE id = ?`).run(
      published.id,
    );

    const fallback = getDefaultBundle();
    expect(fallback?.origin).toBe("custom");
    expect(fallback?.id).toBe(published.id);
  });
});
