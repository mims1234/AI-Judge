import { describe, expect, it } from "vitest";
import {
  chatClassificationJsonSchema,
  judgeOutputJsonSchema,
  stripNumericBoundsForWire,
} from "@/lib/schemas";

describe("stripNumericBoundsForWire", () => {
  it("removes min/max from number nodes in judge schema", () => {
    const wire = stripNumericBoundsForWire(judgeOutputJsonSchema) as {
      properties: {
        overall_score: Record<string, unknown>;
        scores: {
          properties: {
            correctness: Record<string, unknown>;
          };
        };
      };
    };

    expect(wire.properties.overall_score).toEqual({ type: "number" });
    expect(wire.properties.scores.properties.correctness).toEqual({
      type: "number",
    });
    // Source schema unchanged (documentation + local Zod still use bounds).
    expect(judgeOutputJsonSchema.properties.overall_score).toEqual({
      type: "number",
      minimum: 0,
      maximum: 10,
    });
  });

  it("removes bounds from classification confidence", () => {
    const wire = stripNumericBoundsForWire(chatClassificationJsonSchema) as {
      properties: { confidence: Record<string, unknown> };
    };
    expect(wire.properties.confidence).toEqual({ type: "number" });
    expect(chatClassificationJsonSchema.properties.confidence).toEqual({
      type: "number",
      minimum: 0,
      maximum: 1,
    });
  });

  it("handles nullable number types and nested arrays", () => {
    const wire = stripNumericBoundsForWire({
      type: "object",
      properties: {
        score: {
          type: ["number", "null"],
          minimum: 0,
          maximum: 10,
          exclusiveMinimum: 0,
        },
        items: {
          type: "array",
          items: { type: "integer", minimum: 1, multipleOf: 1 },
        },
      },
    }) as {
      properties: {
        score: Record<string, unknown>;
        items: { items: Record<string, unknown> };
      };
    };

    expect(wire.properties.score).toEqual({ type: ["number", "null"] });
    expect(wire.properties.items.items).toEqual({ type: "integer" });
  });

  it("preserves non-numeric constraints", () => {
    const wire = stripNumericBoundsForWire({
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1, enum: ["a", "b"] },
      },
    }) as {
      additionalProperties: boolean;
      required: string[];
      properties: { name: Record<string, unknown> };
    };

    expect(wire.additionalProperties).toBe(false);
    expect(wire.required).toEqual(["name"]);
    expect(wire.properties.name).toEqual({
      type: "string",
      minLength: 1,
      enum: ["a", "b"],
    });
  });
});
