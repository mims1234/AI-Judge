/**
 * Vitest global setup — dummy key + resettable env (plans/11 isolation rules).
 */
import { beforeEach } from "vitest";
import { resetEnvCache } from "@/lib/env";

process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.OPENROUTER_BASE_URL ??= "http://127.0.0.1:9";

beforeEach(() => {
  // Allow individual tests to override BASE_URL / DATABASE_PATH mid-suite.
  resetEnvCache();
});
