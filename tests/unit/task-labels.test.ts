import { describe, expect, it } from "vitest";
import { briefFromSlots, labeledTaskTitles } from "@/lib/bundles/task-labels";

describe("labeledTaskTitles", () => {
  it("leaves unique types unnumbered", () => {
    const titles = labeledTaskTitles([
      { category: "coding" as const },
      { category: "math" as const },
    ]);
    expect(titles.map((t) => t.title)).toEqual(["Coding", "Math"]);
  });

  it("numbers repeated types", () => {
    const titles = labeledTaskTitles([
      { category: "coding" as const },
      { category: "math" as const },
      { category: "coding" as const },
    ]);
    expect(titles.map((t) => t.title)).toEqual(["Coding 1", "Math", "Coding 2"]);
  });

  it("labels catch-all pack types", () => {
    const titles = labeledTaskTitles([
      { category: "general" as const },
      { category: "other" as const },
    ]);
    expect(titles.map((t) => t.title)).toEqual(["General", "Other"]);
  });
});

describe("briefFromSlots", () => {
  it("joins slot briefs in order", () => {
    const brief = briefFromSlots([
      { category: "coding", prompt: "Reverse a string" },
      { category: "coding", prompt: "Merge intervals" },
    ]);
    expect(brief).toContain("[coding] Reverse a string");
    expect(brief).toContain("[coding] Merge intervals");
  });
});
