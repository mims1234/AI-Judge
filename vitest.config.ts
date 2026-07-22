import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for unit + integration suites (plans/11 §Tooling).
 * Environment is node; path alias mirrors tsconfig `@/*`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    // Isolation: never touch the real DB or network by default.
    env: {
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_BASE_URL: "http://127.0.0.1:9",
      DATABASE_PATH: "./data/ai-judge-vitest-placeholder.sqlite",
    },
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/bundles/**", "lib/mocks/**"],
    },
  },
  resolve: {
    // server-only throws on the default export; map to the react-server empty
    // stub so node-side unit/integration tests can import lib/db etc.
    alias: [
      {
        find: "server-only",
        replacement: path.resolve(__dirname, "node_modules/server-only/empty.js"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname),
      },
    ],
  },
});
