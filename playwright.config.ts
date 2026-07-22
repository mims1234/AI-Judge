import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config (plans/11 §3).
 * webServer boots Next with mock OpenRouter + temp DB; global-setup starts the mock.
 */
const mockPort = Number(process.env.AI_JUDGE_MOCK_PORT ?? 4099);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "tests/e2e",
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
    command: `npx cross-env OPENROUTER_API_KEY=test-key OPENROUTER_BASE_URL=http://127.0.0.1:${mockPort} DATABASE_PATH=${path
      .join("data", "e2e-ai-judge.sqlite")
      .replace(/\\/g, "/")} next dev -p 3000`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
