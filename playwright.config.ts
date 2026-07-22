import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config (plans/11 §3).
 * webServer runs tests/e2e/start-stack.mjs (mock OpenRouter + next dev + temp DB).
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3005";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  globalSetup: path.resolve("tests/e2e/global-setup.ts"),
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Always boot the mock+Next stack on :3005 so a casual `next dev` on :3000
    // cannot silently steal the suite away from the OpenRouter mock.
    command: "npx cross-env PORT=3005 AI_JUDGE_MOCK_PORT=4099 node tests/e2e/start-stack.mjs",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
