import { z } from "zod";

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z
    .string()
    .min(1, "OPENROUTER_API_KEY is required (set it in .env.local)"),
  OPENROUTER_BASE_URL: z
    .string()
    .url("OPENROUTER_BASE_URL must be a valid URL")
    .default("https://openrouter.ai/api/v1"),
  DATABASE_PATH: z
    .string()
    .min(1, "DATABASE_PATH must be a non-empty path")
    .default("./data/ai-judge.sqlite"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Fail-fast Zod parse of the three v1 env vars.
 * Call from server boot / DB open / scripts — never from client code.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const result = EnvSchema.safeParse({
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
    DATABASE_PATH: process.env.DATABASE_PATH,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration.\n${details}\n\nCopy .env.example to .env.local and set OPENROUTER_API_KEY.`,
    );
  }

  cached = result.data;
  return cached;
}

/** Clear memoized env (tests only). */
export function resetEnvCache(): void {
  cached = null;
}
