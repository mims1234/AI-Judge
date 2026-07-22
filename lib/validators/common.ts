export interface ValidatorFinding {
  validator: string;
  passed: boolean;
  expected_json: string | null;
  actual_json: string | null;
  details: string;
}

export interface TaskSnapshot {
  category: string;
  output_schema: Record<string, unknown>;
  token_limit: number;
  wrapper?: string;
  task_body?: string;
  judge_prompt?: string;
}

export interface ExtractResult {
  ok: boolean;
  value: unknown | null;
  hadFence: boolean;
  hasExtraProse: boolean;
  rawJsonText: string | null;
}

/** Split on Unicode whitespace; hyphenated compounds = one word; numbers count. */
export function countWords(text: string): number {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/u)
    .filter((t) => t.length > 0).length;
}

/**
 * Trim; unwrap a single Markdown code fence if present; JSON.parse remainder.
 * Any prose outside the JSON object (beyond the tolerated fence) fails no_extra_prose.
 */
export function extractJson(rawOutput: string): ExtractResult {
  const trimmed = (rawOutput ?? "").trim();
  if (!trimmed) {
    return {
      ok: false,
      value: null,
      hadFence: false,
      hasExtraProse: true,
      rawJsonText: null,
    };
  }

  let body = trimmed;
  let hadFence = false;

  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fenceMatch) {
    hadFence = true;
    body = fenceMatch[1]!.trim();
  }

  // Detect leading/trailing prose when not a clean fence wrap
  if (!hadFence) {
    const firstBrace = body.indexOf("{");
    const lastBrace = body.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return {
        ok: false,
        value: null,
        hadFence: false,
        hasExtraProse: true,
        rawJsonText: null,
      };
    }
    const before = body.slice(0, firstBrace).trim();
    const after = body.slice(lastBrace + 1).trim();
    const hasExtraProse = before.length > 0 || after.length > 0;
    const jsonSlice = body.slice(firstBrace, lastBrace + 1);
    try {
      const value = JSON.parse(jsonSlice);
      return {
        ok: true,
        value,
        hadFence: false,
        hasExtraProse,
        rawJsonText: jsonSlice,
      };
    } catch {
      return {
        ok: false,
        value: null,
        hadFence: false,
        hasExtraProse,
        rawJsonText: null,
      };
    }
  }

  try {
    const value = JSON.parse(body);
    return {
      ok: true,
      value,
      hadFence: true,
      hasExtraProse: false,
      rawJsonText: body,
    };
  } catch {
    return {
      ok: false,
      value: null,
      hadFence: true,
      hasExtraProse: false,
      rawJsonText: null,
    };
  }
}

function schemaTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function expectedTypeLabel(prop: Record<string, unknown>): string {
  return typeof prop.type === "string" ? prop.type : "unknown";
}

function collectExactArrayCounts(
  schema: Record<string, unknown>,
  path: string[] = [],
): Array<{ path: string[]; count: number }> {
  const out: Array<{ path: string[]; count: number }> = [];
  const props = schema.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== "object") return out;

  for (const [key, raw] of Object.entries(props)) {
    if (!raw || typeof raw !== "object") continue;
    const prop = raw as Record<string, unknown>;
    const nextPath = [...path, key];
    if (prop.type === "array" && typeof prop.exactCount === "number") {
      out.push({ path: nextPath, count: prop.exactCount });
    }
    if (prop.type === "object") {
      out.push(...collectExactArrayCounts(prop, nextPath));
    }
  }
  return out;
}

function getAtPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function skipped(...validators: string[]): ValidatorFinding[] {
  return validators.map((validator) => ({
    validator,
    passed: false,
    expected_json: null,
    actual_json: null,
    details: "skipped: unparseable JSON",
  }));
}

export function runUniversalValidators(
  rawOutput: string,
  task: TaskSnapshot,
): { findings: ValidatorFinding[]; parsed: Record<string, unknown> | null } {
  const extracted = extractJson(rawOutput);
  const findings: ValidatorFinding[] = [];

  findings.push({
    validator: "json_parseable",
    passed: extracted.ok,
    expected_json: '"valid JSON object"',
    actual_json: extracted.ok ? '"parsed"' : null,
    details: extracted.ok ? "" : "output is not a single valid JSON document",
  });

  findings.push({
    validator: "no_extra_prose",
    passed: extracted.ok && !extracted.hasExtraProse,
    expected_json: '"JSON only (optional single fence)"',
    actual_json: extracted.hasExtraProse ? '"prose outside JSON"' : '"clean"',
    details: extracted.hasExtraProse
      ? "prose found outside the JSON document"
      : "",
  });

  if (!extracted.ok || typeof extracted.value !== "object" || extracted.value === null) {
    findings.push(
      ...skipped("required_keys", "key_types", "array_counts"),
    );
    return { findings, parsed: null };
  }

  const parsed = extracted.value as Record<string, unknown>;
  const schema = task.output_schema;
  const required = Array.isArray(schema.required)
    ? (schema.required as string[])
    : [];
  const properties =
    (schema.properties as Record<string, Record<string, unknown>>) ?? {};

  const missing = required.filter((k) => !(k in parsed));
  findings.push({
    validator: "required_keys",
    passed: missing.length === 0,
    expected_json: JSON.stringify(required),
    actual_json: JSON.stringify(Object.keys(parsed)),
    details:
      missing.length === 0
        ? ""
        : `missing keys: ${missing.join(", ")}`,
  });

  const typeMismatches: string[] = [];
  for (const [key, prop] of Object.entries(properties)) {
    if (!(key in parsed)) continue;
    const expected = expectedTypeLabel(prop);
    const actual = schemaTypeOf(parsed[key]);
    if (expected !== "unknown" && expected !== actual) {
      typeMismatches.push(`${key}: expected ${expected}, got ${actual}`);
    }
  }
  findings.push({
    validator: "key_types",
    passed: typeMismatches.length === 0,
    expected_json: JSON.stringify(
      Object.fromEntries(
        Object.entries(properties).map(([k, p]) => [k, expectedTypeLabel(p)]),
      ),
    ),
    actual_json: JSON.stringify(
      Object.fromEntries(
        Object.keys(properties).map((k) => [k, schemaTypeOf(parsed[k])]),
      ),
    ),
    details: typeMismatches.join("; "),
  });

  const exactCounts = collectExactArrayCounts(schema);
  const countFails: string[] = [];
  for (const { path, count } of exactCounts) {
    const val = getAtPath(parsed, path);
    const actualLen = Array.isArray(val) ? val.length : null;
    if (actualLen !== count) {
      countFails.push(
        `${path.join(".")}: expected ${count}, got ${actualLen ?? "non-array"}`,
      );
    }
  }
  findings.push({
    validator: "array_counts",
    passed: countFails.length === 0,
    expected_json: JSON.stringify(
      Object.fromEntries(exactCounts.map((c) => [c.path.join("."), c.count])),
    ),
    actual_json: JSON.stringify(
      Object.fromEntries(
        exactCounts.map((c) => {
          const val = getAtPath(parsed, c.path);
          return [c.path.join("."), Array.isArray(val) ? val.length : null];
        }),
      ),
    ),
    details: countFails.join("; "),
  });

  return { findings, parsed };
}

export function validatePosterWordLimit(
  parsed: Record<string, unknown> | null,
): ValidatorFinding {
  if (!parsed) {
    return {
      validator: "poster_word_limit",
      passed: false,
      expected_json: '"< 65 words"',
      actual_json: null,
      details: "skipped: unparseable JSON",
    };
  }
  const fields = ["headline", "tagline", "body", "cta"];
  const text = fields
    .map((f) => (typeof parsed[f] === "string" ? (parsed[f] as string) : ""))
    .join(" ");
  const words = countWords(text);
  return {
    validator: "poster_word_limit",
    passed: words < 65,
    expected_json: '"< 65"',
    actual_json: JSON.stringify(words),
    details: words < 65 ? `${words} words (< 65)` : `${words} words (≥ 65)`,
  };
}

export function validateStoryWordRange(
  parsed: Record<string, unknown> | null,
): ValidatorFinding {
  if (!parsed) {
    return {
      validator: "story_word_range",
      passed: false,
      expected_json: '"[500, 700]"',
      actual_json: null,
      details: "skipped: unparseable JSON",
    };
  }
  const story = typeof parsed.story === "string" ? parsed.story : "";
  const words = countWords(story);
  const passed = words >= 500 && words <= 700;
  return {
    validator: "story_word_range",
    passed,
    expected_json: JSON.stringify([500, 700]),
    actual_json: JSON.stringify(words),
    details: passed
      ? `${words} words in [500, 700]`
      : `${words} words outside [500, 700]`,
  };
}

export function validateRoleplayCounts(
  parsed: Record<string, unknown> | null,
): ValidatorFinding {
  if (!parsed) {
    return {
      validator: "roleplay_counts",
      passed: false,
      expected_json: JSON.stringify({ questions: 3, steps: 5 }),
      actual_json: null,
      details: "skipped: unparseable JSON",
    };
  }
  const q = Array.isArray(parsed.diagnostic_questions)
    ? parsed.diagnostic_questions.length
    : -1;
  const s = Array.isArray(parsed.triage_steps)
    ? parsed.triage_steps.length
    : -1;
  const passed = q === 3 && s === 5;
  return {
    validator: "roleplay_counts",
    passed,
    expected_json: JSON.stringify({ questions: 3, steps: 5 }),
    actual_json: JSON.stringify({ questions: q, steps: s }),
    details: passed
      ? "exactly 3 questions and 5 steps"
      : `got ${q} questions and ${s} steps`,
  };
}

export function validateMarketingFields(
  parsed: Record<string, unknown> | null,
  task: TaskSnapshot,
): ValidatorFinding {
  // Delegates to array_counts/required_keys semantics with marketing's exact counts.
  if (!parsed) {
    return {
      validator: "marketing_fields",
      passed: false,
      expected_json: null,
      actual_json: null,
      details: "skipped: unparseable JSON",
    };
  }
  const hero = parsed.hero as Record<string, unknown> | undefined;
  const benefits = hero && Array.isArray(hero.benefits) ? hero.benefits : null;
  const hasHero =
    hero &&
    typeof hero.headline === "string" &&
    typeof hero.subheadline === "string" &&
    typeof hero.primary_cta === "string" &&
    typeof hero.secondary_cta === "string";
  const passed =
    !!hasHero &&
    benefits !== null &&
    benefits.length === 3 &&
    typeof parsed.launch_post === "string";
  return {
    validator: "marketing_fields",
    passed,
    expected_json: JSON.stringify({
      benefits: 3,
      required: task.output_schema.required ?? [],
    }),
    actual_json: JSON.stringify({
      benefits: benefits?.length ?? null,
      has_hero: !!hasHero,
      has_launch_post: typeof parsed.launch_post === "string",
    }),
    details: passed ? "" : "marketing field/count requirements not met",
  };
}

const FORBIDDEN_MODULES = [
  "fs",
  "child_process",
  "net",
  "http",
  "https",
  "os",
  "path",
  "vm",
  "worker_threads",
];

export function validateCodingShape(
  parsed: Record<string, unknown> | null,
): ValidatorFinding[] {
  if (!parsed) {
    return [
      {
        validator: "coding_function_present",
        passed: false,
        expected_json: '"createIdempotencyGuard"',
        actual_json: null,
        details: "skipped: unparseable JSON",
      },
      {
        validator: "coding_test_count",
        passed: false,
        expected_json: ">=5",
        actual_json: null,
        details: "skipped: unparseable JSON",
      },
      {
        validator: "coding_no_forbidden_imports",
        passed: false,
        expected_json: JSON.stringify(FORBIDDEN_MODULES),
        actual_json: null,
        details: "skipped: unparseable JSON",
      },
    ];
  }

  const code = typeof parsed.code === "string" ? parsed.code : "";
  const testsArr = Array.isArray(parsed.tests) ? parsed.tests : [];
  const testsText = testsArr.map(String).join("\n");
  const combined = `${code}\n${testsText}`;

  const fnPresent =
    /function\s+createIdempotencyGuard\b/.test(code) ||
    /const\s+createIdempotencyGuard\s*=/.test(code) ||
    /(?:export\s+)?(?:async\s+)?function\s+createIdempotencyGuard\b/.test(
      code,
    ) ||
    code.includes("createIdempotencyGuard");

  const testMatches = combined.match(/\b(?:test|it|assert)\s*\(/g) ?? [];
  const testCount = Math.max(testMatches.length, testsArr.length);
  const testPass = testCount >= 5;

  const forbiddenFound = FORBIDDEN_MODULES.filter((mod) => {
    const re = new RegExp(
      `(?:require\\s*\\(\\s*['"]${mod}['"]\\s*\\)|from\\s+['"]${mod}['"]|import\\s+['"]${mod}['"])`,
    );
    return re.test(code);
  });

  return [
    {
      validator: "coding_function_present",
      passed: fnPresent,
      expected_json: '"createIdempotencyGuard definition"',
      actual_json: fnPresent ? '"found"' : '"missing"',
      details: fnPresent
        ? "function name present"
        : "createIdempotencyGuard definition not found",
    },
    {
      validator: "coding_test_count",
      passed: testPass,
      expected_json: ">=5",
      actual_json: JSON.stringify(testCount),
      details: testPass
        ? `${testCount} tests detected`
        : `only ${testCount} tests detected (need ≥ 5)`,
    },
    {
      validator: "coding_no_forbidden_imports",
      passed: forbiddenFound.length === 0,
      expected_json: JSON.stringify(FORBIDDEN_MODULES),
      actual_json: JSON.stringify(forbiddenFound),
      details:
        forbiddenFound.length === 0
          ? ""
          : `forbidden imports: ${forbiddenFound.join(", ")}`,
    },
  ];
}
