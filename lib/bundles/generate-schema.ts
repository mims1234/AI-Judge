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
        required: ["category", "task_body", "must_mention", "judge_criteria"],
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
          task_body: { type: "string", minLength: 1, maxLength: 8000 },
          must_mention: {
            type: "array",
            maxItems: 12,
            items: { type: "string", minLength: 1, maxLength: 240 },
          },
          judge_criteria: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: { type: "string", minLength: 1, maxLength: 400 },
          },
        },
      },
    },
  },
} as const;
