import {
  applyCanonicalFooter,
  reviewCustomPack,
  type PackReview,
} from "@/lib/bundles/custom";
import { safetyFn } from "@/lib/bundles/safety";
import { briefFromSlots } from "@/lib/bundles/task-labels";
import { tryRepairTruncatedJson } from "@/lib/judge-parse";
import {
  GeneratedPackSchema,
  type Category,
  type PackSlotInput,
} from "@/lib/schemas";
import { extractJson } from "@/lib/validators/common";

export type FinalizedPackTask = {
  category: Category;
  task_body: string;
  must_mention: string[];
  judge_criteria: string[];
};

export type FinalizeGeneratedOk = {
  ok: true;
  brief: string;
  tasks: FinalizedPackTask[];
  quality: PackReview;
};

export type FinalizeGeneratedErr = {
  ok: false;
  code: "VALIDATION_ERROR" | "SAFETY_REFUSED";
  message: string;
  hint?: string;
};

function parseGeneratedJson(rawText: string): unknown | null {
  const extracted = extractJson(rawText);
  if (extracted.ok) return extracted.value;
  return tryRepairTruncatedJson(rawText);
}

export function finalizeGeneratedPack(input: {
  rawText: string;
  slots: PackSlotInput[];
  notes: string;
}): FinalizeGeneratedOk | FinalizeGeneratedErr {
  const parsedPack = parseGeneratedJson(input.rawText);
  if (parsedPack == null) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Generator returned invalid JSON. Try another model.",
      hint: "The model streamed text that could not be parsed as JSON.",
    };
  }

  const pack = GeneratedPackSchema.safeParse(parsedPack);
  if (!pack.success) {
    const first = pack.error.issues[0];
    const where = first?.path.length ? first.path.join(".") : "root";
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Generator output did not match the bundle schema.",
      hint: first ? `${where}: ${first.message}` : "Try another generator.",
    };
  }

  if (pack.data.tasks.length !== input.slots.length) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Generator returned ${pack.data.tasks.length} tasks; expected ${input.slots.length}.`,
      hint: "The model merged or skipped a slot. Retry, or simplify the briefs.",
    };
  }

  const brief = briefFromSlots(input.slots);
  const tasks = input.slots.map((slot, i) => {
    const t = pack.data.tasks[i]!;
    return {
      category: slot.category,
      task_body: applyCanonicalFooter(t.task_body),
      must_mention: t.must_mention,
      judge_criteria: t.judge_criteria,
    };
  });

  const after = safetyFn(
    brief,
    input.notes,
    tasks.map((t) => t.task_body),
    [
      ...tasks.flatMap((t) => t.must_mention),
      ...tasks.flatMap((t) => t.judge_criteria),
    ],
  );
  if (!after.ok) {
    return {
      ok: false,
      code: "SAFETY_REFUSED",
      message: after.message,
      hint: "Edit the briefs or notes so they do not ask for blocked content.",
    };
  }

  return {
    ok: true,
    brief,
    tasks,
    quality: reviewCustomPack({ tasks }),
  };
}
