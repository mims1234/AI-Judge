export interface ValidatorFinding {
  validator: string;
  passed: boolean;
  expected_json: string | null;
  actual_json: string | null;
  details: string;
  /**
   * Not evaluated (usually because JSON was unparseable).
   * Persisted via details prefix `skipped:` for DB round-trips / legacy rows.
   */
  skipped?: boolean;
  /**
   * Soft note — shown to judges/UI but excluded from pass-rate counts.
   * Persisted via details prefix `note:` for DB round-trips.
   */
  informational?: boolean;
}

/** Creative categories where prose outside JSON is a note, not a hard fail. */
export const CREATIVE_CATEGORIES = new Set([
  "roleplay",
  "story",
  "poster",
  "marketing",
]);

export function isSkippedFinding(f: {
  details: string;
  skipped?: boolean;
}): boolean {
  return f.skipped === true || f.details.startsWith("skipped:");
}

export function isInformationalFinding(f: {
  details: string;
  informational?: boolean;
}): boolean {
  return f.informational === true || f.details.startsWith("note:");
}

/** Findings that count toward validators_passed / validators_total. */
export function isCountableFinding(f: {
  details: string;
  skipped?: boolean;
  informational?: boolean;
}): boolean {
  return !isSkippedFinding(f) && !isInformationalFinding(f);
}

/** Normalize a finding after load (derive flags from details prefixes). */
export function hydrateValidatorFinding(f: ValidatorFinding): ValidatorFinding {
  return {
    ...f,
    skipped: isSkippedFinding(f),
    informational: isInformationalFinding(f),
  };
}

function skippedFinding(validator: string): ValidatorFinding {
  return {
    validator,
    passed: false,
    expected_json: null,
    actual_json: null,
    details: "skipped: unparseable JSON",
    skipped: true,
  };
}

function withNotePrefix(details: string): string {
  const trimmed = details.trim();
  if (!trimmed) return "note:";
  if (trimmed.startsWith("note:")) return trimmed;
  return `note: ${trimmed}`;
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
 * Try JSON.parse on a brace-sliced substring. Returns null if not parseable.
 */
function tryParseObjectSlice(text: string): {
  value: unknown;
  slice: string;
  hasExtraProse: boolean;
} | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  const before = text.slice(0, firstBrace).trim();
  const after = text.slice(lastBrace + 1).trim();
  // Trailing fence close after the object (``` leftover) is not prose.
  const afterIsFenceClose = after === "" || /^```+$/.test(after);
  const hasExtraProse = before.length > 0 || (!afterIsFenceClose && after.length > 0);
  const slice = text.slice(firstBrace, lastBrace + 1);
  try {
    return { value: JSON.parse(slice), slice, hasExtraProse };
  } catch {
    return null;
  }
}

/**
 * Trim; unwrap a Markdown code fence when present; JSON.parse remainder.
 * Tolerates prose around the object (flagged via hasExtraProse) and unclosed
 * / nested fences by falling back to first-{ … last-} slicing.
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

  // Clean single fence wrapping the whole response.
  const cleanFence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (cleanFence) {
    const body = cleanFence[1]!.trim();
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
      // Fall through to brace-slice inside the fence body.
      const sliced = tryParseObjectSlice(body);
      if (sliced) {
        return {
          ok: true,
          value: sliced.value,
          hadFence: true,
          hasExtraProse: sliced.hasExtraProse,
          rawJsonText: sliced.slice,
        };
      }
      return {
        ok: false,
        value: null,
        hadFence: true,
        hasExtraProse: false,
        rawJsonText: null,
      };
    }
  }

  // Opening fence without a clean close, or multiple fences — peel the opener.
  const openFence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*)$/i);
  const candidate = openFence ? openFence[1]!.trim() : trimmed;
  const hadFence = Boolean(openFence);

  const sliced = tryParseObjectSlice(candidate);
  if (sliced) {
    return {
      ok: true,
      value: sliced.value,
      hadFence,
      hasExtraProse: sliced.hasExtraProse,
      rawJsonText: sliced.slice,
    };
  }

  // Last resort: entire trimmed text as JSON.
  try {
    const value = JSON.parse(trimmed);
    return {
      ok: true,
      value,
      hadFence: false,
      hasExtraProse: false,
      rawJsonText: trimmed,
    };
  } catch {
    return {
      ok: false,
      value: null,
      hadFence,
      hasExtraProse: true,
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

export function runUniversalValidators(
  rawOutput: string,
  task: TaskSnapshot,
): { findings: ValidatorFinding[]; parsed: Record<string, unknown> | null } {
  const extracted = extractJson(rawOutput);
  const findings: ValidatorFinding[] = [];
  const creative = CREATIVE_CATEGORIES.has(task.category);

  findings.push({
    validator: "json_parseable",
    passed: extracted.ok,
    expected_json: '"valid JSON object"',
    actual_json: extracted.ok ? '"parsed"' : null,
    details: extracted.ok ? "" : "output is not a single valid JSON document",
  });

  const prosePassed = extracted.ok && !extracted.hasExtraProse;
  const proseDetails = extracted.hasExtraProse
    ? "prose found outside the JSON document"
    : "";
  findings.push({
    validator: "no_extra_prose",
    passed: prosePassed,
    expected_json: '"JSON only (optional single fence)"',
    actual_json: extracted.hasExtraProse ? '"prose outside JSON"' : '"clean"',
    details: creative ? withNotePrefix(proseDetails || "clean envelope") : proseDetails,
    informational: creative,
  });

  if (!extracted.ok || typeof extracted.value !== "object" || extracted.value === null) {
    findings.push(
      skippedFinding("required_keys"),
      skippedFinding("key_types"),
      skippedFinding("array_counts"),
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
      ...skippedFinding("poster_word_limit"),
      expected_json: '"< 65 words"',
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
      ...skippedFinding("story_word_range"),
      expected_json: '"[500, 700]"',
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
      ...skippedFinding("roleplay_counts"),
      expected_json: JSON.stringify({ questions: 3, steps: 5 }),
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
    return skippedFinding("marketing_fields");
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
        ...skippedFinding("coding_function_present"),
        expected_json: '"createIdempotencyGuard"',
      },
      {
        ...skippedFinding("coding_test_count"),
        expected_json: ">=5",
      },
      {
        ...skippedFinding("coding_no_forbidden_imports"),
        expected_json: JSON.stringify(FORBIDDEN_MODULES),
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
