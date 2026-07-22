import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER } from "@/lib/schemas";
import { selectPanels } from "@/lib/run-engine";

const POOL6 = [
  "mock/judge-1",
  "mock/judge-2",
  "mock/judge-3",
  "mock/judge-4",
  "mock/judge-5",
  "mock/cand-a",
];

function panelFor(rows: ReturnType<typeof selectPanels>["rows"], cat: string) {
  return rows
    .filter((r) => r.category === cat && r.panel_position != null)
    .sort((a, b) => (a.panel_position ?? 0) - (b.panel_position ?? 0))
    .map((r) => r.judge_model_id);
}

function reservesFor(
  rows: ReturnType<typeof selectPanels>["rows"],
  cat: string,
) {
  return rows
    .filter((r) => r.category === cat && r.reserve_order != null)
    .sort((a, b) => (a.reserve_order ?? 0) - (b.reserve_order ?? 0))
    .map((r) => r.judge_model_id);
}

describe("selectPanels (plans/11 §1.1)", () => {
  it("determinism — golden panel for seed 42 / coding", () => {
    const a = selectPanels(42, POOL6, ["coding"]);
    const b = selectPanels(42, POOL6, ["coding"]);
    expect(panelFor(a.rows, "coding")).toEqual(panelFor(b.rows, "coding"));
    expect(reservesFor(a.rows, "coding")).toEqual(
      reservesFor(b.rows, "coding"),
    );
    // Golden snapshot — change only if PRNG/panel algorithm intentionally changes.
    expect(panelFor(a.rows, "coding")).toEqual([
      "mock/judge-3",
      "mock/cand-a",
      "mock/judge-4",
    ]);
  });

  it("seed sensitivity — at least one difference across 20 seeds", () => {
    const first = panelFor(selectPanels(0, POOL6, ["math"]).rows, "math").join(
      "|",
    );
    let differed = false;
    for (let s = 1; s < 20; s++) {
      const p = panelFor(selectPanels(s, POOL6, ["math"]).rows, "math").join(
        "|",
      );
      if (p !== first) {
        differed = true;
        break;
      }
    }
    expect(differed).toBe(true);
  });

  it("category independence — same seed, different categories diverge", () => {
    const coding = panelFor(
      selectPanels(99, POOL6, ["coding", "math"]).rows,
      "coding",
    ).join("|");
    const math = panelFor(
      selectPanels(99, POOL6, ["coding", "math"]).rows,
      "math",
    ).join("|");
    expect(coding).not.toEqual(math);
  });

  it("shared panel per category — candidate id is not an input", () => {
    // selectPanels signature has no candidate — pin that contract.
    expect(selectPanels.length).toBe(3);
    const once = selectPanels(7, POOL6, ["story"]);
    expect(panelFor(once.rows, "story")).toHaveLength(3);
    expect(reservesFor(once.rows, "story").length).toBeGreaterThanOrEqual(0);
  });

  it("fairness sanity — every pool member appears over 2000 seeds", () => {
    const counts = new Map<string, number>();
    for (const id of POOL6) counts.set(id, 0);
    for (let s = 0; s < 2000; s++) {
      for (const id of panelFor(
        selectPanels(s, POOL6, ["research"]).rows,
        "research",
      )) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    // Expected ~50% of panels (3/6) → ~1000; allow ±20% → [800, 1200]
    for (const id of POOL6) {
      const n = counts.get(id)!;
      expect(n).toBeGreaterThanOrEqual(800);
      expect(n).toBeLessThanOrEqual(1200);
    }
  });

  it("insufficient pool (<3) yields incomplete panel rows", () => {
    // Backend does not throw PanelSelectionError today (see VIOLATIONS Q-B01 adjacency).
    // Pin observable behavior: fewer than 3 panel_position rows.
    const rows = selectPanels(1, ["only/one", "only/two"], ["poster"]).rows;
    expect(panelFor(rows, "poster").length).toBeLessThan(3);
  });

  it("covers all requested categories in CATEGORY_ORDER", () => {
    const { rows } = selectPanels(1, POOL6, [...CATEGORY_ORDER]);
    for (const cat of CATEGORY_ORDER) {
      expect(panelFor(rows, cat)).toHaveLength(3);
    }
  });
});
