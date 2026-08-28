import "server-only";

import { randomUUID } from "node:crypto";
import {
  applyCanonicalFooter,
  computeCustomContentHash,
  CUSTOM_ANSWER_SCHEMA,
  CUSTOM_JSON_FOOTER,
  buildBundleJudgePrompt,
  CUSTOM_TOKEN_LIMITS,
  CUSTOM_WRAPPER,
  extractJudgeCriteria,
  publishBlockReason,
  reviewCustomPack,
  slugifyName,
  uniqueSlug,
  type PackReview,
} from "@/lib/bundles/custom";
import { safetyFn } from "@/lib/bundles/safety";
import { getBundleBySlugOrId, getBundleTasks, parseMustMention } from "@/lib/server/bundles";
import type { BundleRow, TaskRow } from "@/lib/bundles/types";
import { getDb, prepare } from "@/lib/db";
import type { Category } from "@/lib/schemas";
import { CategorySchema } from "@/lib/schemas";

export type CustomTaskDraft = {
  category: Category;
  task_body: string;
  must_mention: string[];
  judge_criteria?: string[];
};

function slugTaken(slug: string): boolean {
  return getBundleBySlugOrId(slug) != null;
}

function draftFromRow(t: TaskRow): CustomTaskDraft {
  return {
    category: t.category,
    task_body: t.task_body,
    must_mention: parseMustMention(t.must_mention_json),
    judge_criteria: extractJudgeCriteria(t.judge_prompt),
  };
}

function hashFromDraft(input: {
  name: string;
  version: string;
  wrapper: string;
  tasks: CustomTaskDraft[];
}): string {
  return computeCustomContentHash({
    name: input.name,
    version: input.version,
    wrapper: input.wrapper,
    tasks: input.tasks.map((t) => ({
      category: t.category,
      task_body: applyCanonicalFooter(t.task_body),
      judge_prompt: buildBundleJudgePrompt(t.judge_criteria ?? []),
      output_schema: CUSTOM_ANSWER_SCHEMA,
      token_limit: CUSTOM_TOKEN_LIMITS[t.category],
      weight: 1,
      must_mention: t.must_mention,
    })),
  });
}

export function assertMutableDraft(bundle: BundleRow, userId: string): void {
  if (bundle.origin !== "custom") {
    throw Object.assign(new Error("Official bundles cannot be edited."), {
      code: "FORBIDDEN",
    });
  }
  if (bundle.status !== "draft") {
    throw Object.assign(new Error("Published bundles cannot be edited."), {
      code: "FORBIDDEN",
    });
  }
  if (bundle.author_user_id !== userId) {
    throw Object.assign(new Error("Only the author can edit this draft."), {
      code: "FORBIDDEN",
    });
  }
}

export function createCustomDraft(input: {
  authorId: string;
  name: string;
  brief: string;
  reference_notes: string;
  generator_model_id: string | null;
  tasks: CustomTaskDraft[];
}): BundleRow {
  if (input.tasks.length < 1 || input.tasks.length > 5) {
    throw Object.assign(new Error("A bundle needs 1–5 prompts."), {
      code: "VALIDATION_ERROR",
    });
  }

  const safety = safetyFn(
    input.brief,
    input.reference_notes,
    input.tasks.map((t) => t.task_body),
    input.tasks.flatMap((t) => t.must_mention),
    input.tasks.flatMap((t) => t.judge_criteria ?? []),
  );
  if (!safety.ok) {
    throw Object.assign(new Error(safety.message), { code: safety.code });
  }

  const name = input.name.trim().slice(0, 80) || "Custom bundle";
  const slug = uniqueSlug(slugifyName(name), slugTaken);
  const shortId = randomUUID().slice(0, 8);
  const version = `0.0.0-draft-${shortId}`;
  const normalized = input.tasks.map((t) => ({
    ...t,
    task_body: applyCanonicalFooter(t.task_body),
    must_mention: t.must_mention.map((m) => m.trim()).filter(Boolean),
  }));
  const quality = reviewCustomPack({ tasks: normalized });
  const hash = hashFromDraft({
    name,
    version,
    wrapper: CUSTOM_WRAPPER,
    tasks: normalized,
  });

  const now = Date.now();
  const bundleId = randomUUID();

  const db = getDb();
  db.transaction(() => {
    prepare(
      `INSERT INTO bundles (
        id, name, version, slug, content_hash, status, changelog, created_at,
        origin, brief, reference_notes, generator_model_id, author_user_id, quality_json
      ) VALUES (
        @id, @name, @version, @slug, @content_hash, 'draft', @changelog, @created_at,
        'custom', @brief, @reference_notes, @generator_model_id, @author_user_id, @quality_json
      )`,
    ).run({
      id: bundleId,
      name,
      version,
      slug,
      content_hash: hash,
      changelog: "Draft bundle.",
      created_at: now,
      brief: input.brief,
      reference_notes: input.reference_notes,
      generator_model_id: input.generator_model_id,
      author_user_id: input.authorId,
      quality_json: JSON.stringify(quality),
    });

    const insertTask = prepare(
      `INSERT INTO tasks (
        id, bundle_id, category, wrapper, task_body, judge_prompt,
        output_schema, token_limit, weight, must_mention_json
      ) VALUES (
        @id, @bundle_id, @category, @wrapper, @task_body, @judge_prompt,
        @output_schema, @token_limit, @weight, @must_mention_json
      )`,
    );

    for (const task of normalized) {
      insertTask.run({
        id: randomUUID(),
        bundle_id: bundleId,
        category: task.category,
        wrapper: CUSTOM_WRAPPER,
        task_body: task.task_body,
        judge_prompt: buildBundleJudgePrompt(task.judge_criteria ?? []),
        output_schema: JSON.stringify(CUSTOM_ANSWER_SCHEMA),
        token_limit: CUSTOM_TOKEN_LIMITS[task.category],
        weight: 1,
        must_mention_json: JSON.stringify(task.must_mention),
      });
    }
  })();

  const row = getBundleBySlugOrId(bundleId);
  if (!row) throw new Error("failed to create draft");
  return row;
}

export function updateCustomDraft(
  bundleId: string,
  userId: string,
  patch: {
    name?: string;
    brief?: string;
    reference_notes?: string;
    tasks?: CustomTaskDraft[];
  },
): BundleRow {
  const bundle = getBundleBySlugOrId(bundleId);
  if (!bundle) {
    throw Object.assign(new Error("Bundle not found"), { code: "BUNDLE_NOT_FOUND" });
  }
  assertMutableDraft(bundle, userId);

  const existingTasks = getBundleTasks(bundle.id).map(draftFromRow);
  const tasks = patch.tasks ?? existingTasks;
  const name = (patch.name ?? bundle.name).trim().slice(0, 80) || bundle.name;
  const brief = patch.brief ?? bundle.brief ?? "";
  const notes = patch.reference_notes ?? bundle.reference_notes ?? "";

  const safety = safetyFn(
    brief,
    notes,
    tasks.map((t) => t.task_body),
    tasks.flatMap((t) => t.must_mention),
    tasks.flatMap((t) => t.judge_criteria ?? []),
  );
  if (!safety.ok) {
    throw Object.assign(new Error(safety.message), { code: safety.code });
  }

  const normalized = tasks.map((t) => ({
    ...t,
    category: CategorySchema.parse(t.category),
    task_body: applyCanonicalFooter(t.task_body),
    must_mention: t.must_mention.map((m) => m.trim()).filter(Boolean),
  }));
  if (normalized.length < 1 || normalized.length > 5) {
    throw Object.assign(new Error("A bundle needs 1–5 prompts."), {
      code: "VALIDATION_ERROR",
    });
  }
  const quality = reviewCustomPack({ tasks: normalized });
  const hash = hashFromDraft({
    name,
    version: bundle.version,
    wrapper: CUSTOM_WRAPPER,
    tasks: normalized,
  });

  const db = getDb();
  db.transaction(() => {
    prepare(
      `UPDATE bundles SET name = ?, brief = ?, reference_notes = ?,
        content_hash = ?, quality_json = ? WHERE id = ?`,
    ).run(name, brief, notes, hash, JSON.stringify(quality), bundle.id);

    prepare(`DELETE FROM tasks WHERE bundle_id = ?`).run(bundle.id);
    const insertTask = prepare(
      `INSERT INTO tasks (
        id, bundle_id, category, wrapper, task_body, judge_prompt,
        output_schema, token_limit, weight, must_mention_json
      ) VALUES (
        @id, @bundle_id, @category, @wrapper, @task_body, @judge_prompt,
        @output_schema, @token_limit, @weight, @must_mention_json
      )`,
    );
    for (const task of normalized) {
      insertTask.run({
        id: randomUUID(),
        bundle_id: bundle.id,
        category: task.category,
        wrapper: CUSTOM_WRAPPER,
        task_body: task.task_body,
        judge_prompt: buildBundleJudgePrompt(task.judge_criteria ?? []),
        output_schema: JSON.stringify(CUSTOM_ANSWER_SCHEMA),
        token_limit: CUSTOM_TOKEN_LIMITS[task.category],
        weight: 1,
        must_mention_json: JSON.stringify(task.must_mention),
      });
    }
  })();

  return getBundleBySlugOrId(bundle.id)!;
}

export function publishCustomDraft(bundleId: string, userId: string): BundleRow {
  const bundle = getBundleBySlugOrId(bundleId);
  if (!bundle) {
    throw Object.assign(new Error("Bundle not found"), { code: "BUNDLE_NOT_FOUND" });
  }
  assertMutableDraft(bundle, userId);

  const tasks = getBundleTasks(bundle.id);
  if (tasks.length < 1) {
    throw Object.assign(new Error("Cannot publish an empty bundle."), {
      code: "VALIDATION_ERROR",
    });
  }
  for (const t of tasks) {
    if (!t.task_body.trim()) {
      throw Object.assign(new Error("Every task needs a body."), {
        code: "VALIDATION_ERROR",
      });
    }
  }

  const safety = safetyFn(
    bundle.brief,
    bundle.reference_notes,
    tasks.map((t) => t.task_body),
    tasks.flatMap((t) => parseMustMention(t.must_mention_json)),
    tasks.flatMap((t) => extractJudgeCriteria(t.judge_prompt)),
  );
  if (!safety.ok) {
    throw Object.assign(new Error(safety.message), { code: safety.code });
  }

  const normalized = tasks.map((t) => ({
    ...draftFromRow(t),
    task_body: applyCanonicalFooter(t.task_body),
  }));
  const quality = reviewCustomPack({ tasks: normalized });
  const blocked = publishBlockReason(quality);
  if (blocked) {
    throw Object.assign(new Error(blocked), { code: "VALIDATION_ERROR" });
  }
  let name = bundle.name;
  const version = "1.0.0";
  const nameTaken = prepare(
    `SELECT id FROM bundles WHERE name = ? AND version = ? AND id != ?`,
  ).get(name, version, bundle.id) as { id: string } | undefined;
  if (nameTaken) {
    name = `${bundle.name} · ${bundle.slug}`.slice(0, 80);
  }
  const hash = hashFromDraft({
    name,
    version,
    wrapper: CUSTOM_WRAPPER,
    tasks: normalized,
  });

  const db = getDb();
  db.transaction(() => {
    for (const task of tasks) {
      prepare(`UPDATE tasks SET task_body = ? WHERE id = ?`).run(
        applyCanonicalFooter(task.task_body),
        task.id,
      );
    }
    prepare(
      `UPDATE bundles SET name = ?, version = ?, content_hash = ?, status = 'published',
        quality_json = ?, changelog = ? WHERE id = ?`,
    ).run(
      name,
      version,
      hash,
      JSON.stringify(quality),
      "Published bundle.",
      bundle.id,
    );
  })();

  return getBundleBySlugOrId(bundle.id)!;
}

export function deleteCustomDraft(bundleId: string, userId: string): void {
  const bundle = getBundleBySlugOrId(bundleId);
  if (!bundle) {
    throw Object.assign(new Error("Bundle not found"), { code: "BUNDLE_NOT_FOUND" });
  }
  assertMutableDraft(bundle, userId);
  const db = getDb();
  db.transaction(() => {
    prepare(`DELETE FROM tasks WHERE bundle_id = ?`).run(bundle.id);
    prepare(`DELETE FROM bundles WHERE id = ?`).run(bundle.id);
  })();
}

export function draftQuality(bundle: BundleRow): PackReview | null {
  if (!bundle.quality_json) return null;
  try {
    return JSON.parse(bundle.quality_json) as PackReview;
  } catch {
    return null;
  }
}

export function tasksToDrafts(tasks: TaskRow[]): CustomTaskDraft[] {
  return tasks.map(draftFromRow);
}

function improvedName(name: string): string {
  const base = name.replace(/\s+improved$/i, "").trim();
  return `${base} improved`.slice(0, 80);
}

function promptFromTaskBody(body: string): string {
  return body.replace(CUSTOM_JSON_FOOTER, "").trim().slice(0, 2_000);
}

/** Copy a published (or own draft) custom pack into the create-pack wizard. */
export function loadPackImproveSeed(
  from: string,
  userId: string,
): {
  name: string;
  notes: string;
  modelId: string;
  sourceSlug: string;
  slots: Array<{ category: Category; prompt: string }>;
  tasks: CustomTaskDraft[];
  quality: PackReview | null;
} | null {
  const bundle = getBundleBySlugOrId(from);
  if (!bundle || bundle.origin !== "custom") return null;
  if (bundle.status !== "published" && bundle.author_user_id !== userId) {
    return null;
  }
  const tasks = tasksToDrafts(getBundleTasks(bundle.id));
  if (tasks.length === 0) return null;
  return {
    name: improvedName(bundle.name),
    notes: bundle.reference_notes ?? "",
    modelId: bundle.generator_model_id ?? "",
    sourceSlug: bundle.slug,
    slots: tasks.map((t) => ({
      category: t.category,
      prompt: promptFromTaskBody(t.task_body),
    })),
    tasks,
    quality: reviewCustomPack({ tasks }),
  };
}
