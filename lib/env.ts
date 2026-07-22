import { z } from "zod";

const EnvSchema = z.object({
  // Optional: required only for local/dev convenience. Production uses BYOK
  // (user-supplied key via request header / localStorage).
  OPENROUTER_API_KEY: z.string().optional().default(""),
  OPENROUTER_BASE_URL: z
    .string()
    .url("OPENROUTER_BASE_URL must be a valid URL")
    .default("https://openrouter.ai/api/v1"),
  DATABASE_PATH: z
    .string()
    .min(1, "DATABASE_PATH must be a non-empty path")
    .default("./data/ai-judge.sqlite"),
  /**
   * Force BYOK key policy independently of Next's NODE_ENV.
   * - unset / empty → follow NODE_ENV (prod = BYOK required)
   * - "dev"         → allow OPENROUTER_API_KEY env fallback
   * - "prod"        → require browser key (ignore env key)
   */
  AI_JUDGE_MODE: z
    .enum(["", "dev", "prod"])
    .optional()
    .default(""),
});

export type Env = z.infer<typeof EnvSchema>;
export type AiJudgeMode = "dev" | "prod";

let cached: Env | null = null;

/**
 * Fail-fast Zod parse of server env vars.
 * Call from server boot / DB open / scripts — never from client code.
 * OPENROUTER_API_KEY is optional (BYOK in production).
 */
export function getEnv(): Env {
  if (cached) return cached;

  const rawMode = (process.env.AI_JUDGE_MODE ?? "").trim().toLowerCase();
  const result = EnvSchema.safeParse({
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
    DATABASE_PATH: process.env.DATABASE_PATH,
    AI_JUDGE_MODE: rawMode === "development" ? "dev" : rawMode === "production" ? "prod" : rawMode,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration.\n${details}\n\nCopy .env.example to .env.local.`,
    );
  }

  cached = result.data;
  return cached;
}

/**
 * Effective app mode for BYOK policy.
 * Prefer AI_JUDGE_MODE from .env.local; otherwise NODE_ENV === "production" → prod.
 */
export function getAiJudgeMode(): AiJudgeMode {
  const mode = getEnv().AI_JUDGE_MODE;
  if (mode === "dev" || mode === "prod") return mode;
  return process.env.NODE_ENV === "production" ? "prod" : "dev";
}

/** True when OPENROUTER_API_KEY may be used as a server-side fallback. */
export function isEnvApiKeyFallbackAllowed(): boolean {
  return getAiJudgeMode() === "dev";
}

/** Clear memoized env (tests only). */
export function resetEnvCache(): void {
  cached = null;
}
