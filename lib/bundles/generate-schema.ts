/** Hand-written JSON Schema for custom-pack generation (structured output). */
export const generatedPackJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    tasks: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "task_body", "must_mention"],
        properties: {
          category: {
            type: "string",
            enum: [
              "roleplay",
              "coding",
              "math",
              "research",
              "marketing",
              "poster",
              "story",
              "judging",
              "general",
              "other",
            ],
          },
          task_body: { type: "string" },
          must_mention: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  },
} as const;
