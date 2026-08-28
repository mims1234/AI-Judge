import {
  applyCanonicalFooter,
  reviewCustomPack,
  type PackReview,
} from "@/lib/bundles/custom";
import { safetyFn } from "@/lib/bundles/safety";
import { briefFromSlots } from "@/lib/bundles/task-labels";
import {
  GeneratedPackSchema,
  type Category,
  type PackSlotInput,
} from "@/lib/schemas";

export type FinalizedPackTask = {
  category: Category;
  task_body: string;
  must_mention: string[];
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
};

export function finalizeGeneratedPack(input: {
  rawText: string;
  slots: PackSlotInput[];
  notes: string;
}): FinalizeGeneratedOk | FinalizeGeneratedErr {
  let parsedPack: unknown;
  try {
    parsedPack = JSON.parse(input.rawText);
  } catch {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Generator returned invalid JSON. Try another model.",
    };
  }

  const pack = GeneratedPackSchema.safeParse(parsedPack);
  if (!pack.success) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Generator output did not match the pack schema.",
    };
  }

  if (pack.data.tasks.length !== input.slots.length) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Generator returned ${pack.data.tasks.length} tasks; expected ${input.slots.length}.`,
    };
  }

  const brief = briefFromSlots(input.slots);
  const tasks = input.slots.map((slot, i) => {
    const t = pack.data.tasks[i]!;
    return {
      category: slot.category,
      task_body: applyCanonicalFooter(t.task_body),
      must_mention: t.must_mention,
    };
  });

  const after = safetyFn(
    brief,
    input.notes,
    tasks.map((t) => t.task_body),
    tasks.flatMap((t) => t.must_mention),
  );
  if (!after.ok) {
    return { ok: false, code: "SAFETY_REFUSED", message: after.message };
  }

  return {
    ok: true,
    brief,
    tasks,
    quality: reviewCustomPack({ tasks }),
  };
}
