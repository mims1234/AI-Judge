import type { GeneratePhase } from "@/lib/schemas";

export function countStreamedTasks(text: string): number {
  return (text.match(/"task_body"\s*:/g) ?? []).length;
}

export function generateProgress(opts: {
  phase: GeneratePhase;
  text: string;
  slotCount: number;
  done?: boolean;
  failed?: boolean;
}): { value: number; max: number; label: string } {
  const max = 100;
  if (opts.failed) {
    return { value: 12, max, label: "Stopped" };
  }
  if (opts.done) return { value: 100, max, label: "Draft ready" };

  const slots = Math.max(1, opts.slotCount);
  const detected = Math.min(slots, countStreamedTasks(opts.text));

  switch (opts.phase) {
    case "connecting":
      return { value: 6, max, label: "Connecting to generator" };
    case "writing": {
      const fromTasks = detected / slots;
      const fromChars = Math.min(0.85, opts.text.length / (slots * 1400));
      const frac = Math.max(fromTasks, fromChars * 0.55);
      const value = 10 + Math.round(frac * 70);
      if (detected > 0) {
        return { value, max, label: `Writing drafts · ${detected}/${slots} tasks` };
      }
      return {
        value,
        max,
        label: opts.text.length > 0 ? "Writing drafts" : "Waiting for the first tokens",
      };
    }
    case "validating":
      return { value: 88, max, label: "Checking schema" };
    case "reviewing":
      return { value: 96, max, label: "Scoring the draft" };
  }
}
