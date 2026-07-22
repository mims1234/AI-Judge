import { describe, expect, it } from "vitest";
import {
  buildCellHref,
  isCategory,
  parseCellParam,
  parseTrialParam,
} from "@/lib/cellRef";

describe("parseCellParam (plans/15 §A1)", () => {
  it("parses candidate:category", () => {
    expect(parseCellParam("openai/gpt-4:coding")).toEqual({
      candidate: "openai/gpt-4",
      category: "coding",
      trial: null,
    });
  });

  it("parses candidate:category:trial", () => {
    expect(parseCellParam("openai/gpt-4:math:2")).toEqual({
      candidate: "openai/gpt-4",
      category: "math",
      trial: 2,
    });
  });

  it("handles model ids containing a colon (free-tier suffix)", () => {
    expect(parseCellParam("cohere/command-r:free:story:1")).toEqual({
      candidate: "cohere/command-r:free",
      category: "story",
      trial: 1,
    });
    expect(parseCellParam("cohere/command-r:free:poster")).toEqual({
      candidate: "cohere/command-r:free",
      category: "poster",
      trial: null,
    });
  });

  it("rejects unknown category, empty candidate, and junk", () => {
    expect(parseCellParam("openai/gpt-4:unknown").candidate).toBeNull();
    expect(parseCellParam(":coding").candidate).toBeNull();
    expect(parseCellParam("coding").candidate).toBeNull();
    expect(parseCellParam(null).candidate).toBeNull();
    expect(parseCellParam("").candidate).toBeNull();
  });

  it("rejects non-numeric trial suffix", () => {
    expect(parseCellParam("openai/gpt-4:coding:abc").candidate).toBeNull();
  });
});

describe("parseTrialParam", () => {
  it("accepts non-negative integers", () => {
    expect(parseTrialParam("0")).toBe(0);
    expect(parseTrialParam("3")).toBe(3);
  });

  it("rejects everything else", () => {
    expect(parseTrialParam(null)).toBeNull();
    expect(parseTrialParam("")).toBeNull();
    expect(parseTrialParam("-1")).toBeNull();
    expect(parseTrialParam("1.5")).toBeNull();
    expect(parseTrialParam("abc")).toBeNull();
  });
});

describe("isCategory", () => {
  it("accepts the 8 enum values", () => {
    expect(isCategory("roleplay")).toBe(true);
    expect(isCategory("judging")).toBe(true);
    expect(isCategory("general")).toBe(false);
    expect(isCategory("")).toBe(false);
  });
});

describe("buildCellHref", () => {
  it("puts candidate in the query (ids contain / and :)", () => {
    expect(buildCellHref("run-1", "cohere/command-r:free", "coding")).toBe(
      "/runs/run-1/cell/coding?candidate=cohere%2Fcommand-r%3Afree",
    );
  });

  it("adds trial when provided", () => {
    const href = buildCellHref("run-1", "openai/gpt-4", "math", 2);
    expect(href).toContain("/runs/run-1/cell/math?");
    expect(href).toContain("candidate=openai%2Fgpt-4");
    expect(href).toContain("trial=2");
  });

  it("round-trips through parseCellParam semantics", () => {
    // The href is query-based; verify URL parsing recovers the parts.
    const href = buildCellHref("run-1", "a/b:c", "story", 4);
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/runs/run-1/cell/story");
    expect(url.searchParams.get("candidate")).toBe("a/b:c");
    expect(parseTrialParam(url.searchParams.get("trial"))).toBe(4);
  });
});
