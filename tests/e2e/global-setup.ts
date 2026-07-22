/**
 * Playwright global setup placeholder (plans/11 §3).
 * Mock + Next are started by webServer via tests/e2e/start-stack.mjs so the
 * mock process stays alive for the whole run (globalSetup alone would exit).
 */
async function globalSetup() {
  process.env.OPENROUTER_API_KEY ??= "test-key";
}

export default globalSetup;
