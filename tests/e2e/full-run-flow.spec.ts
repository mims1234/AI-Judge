import { expect, test } from "@playwright/test";
import { visibleStepHeading } from "./helpers";

/**
 * Full configure → analytics smoke flow (plans/11 §3.1).
 * Relies on mock OpenRouter from start-stack.mjs webServer.
 */
test.describe.configure({ mode: "serial" });

test("configure wizard deep-links and review preflight surface", async ({
  page,
}) => {
  await page.goto("/run?demo=1&step=1");
  await expect(visibleStepHeading(page, 1)).toBeVisible();

  await page.goto("/run?demo=1&step=2");
  await expect(visibleStepHeading(page, 2)).toBeVisible();

  await page.goto("/run?demo=1&step=3");
  await expect(visibleStepHeading(page, 3)).toBeVisible();

  await page.goto("/run?demo=1&step=4");
  await expect(visibleStepHeading(page, 4)).toBeVisible();
});

test("leaderboard + compare + judges demo surfaces render", async ({ page }) => {
  await page.goto("/leaderboard?demo=1");
  await expect(page.getByRole("heading", { name: /leaderboard/i })).toBeVisible();
  await expect(page.getByTestId("export-leaderboard-csv")).toBeVisible();
  await expect(page.getByTestId("export-leaderboard-json")).toBeVisible();

  await page.goto(
    "/compare?demo=1&models=anthropic/claude-sonnet-4.5,openai/gpt-5.1",
  );
  await expect(page.getByRole("heading", { name: /compare/i })).toBeVisible();

  await page.goto("/judges?demo=1");
  await expect(page.getByRole("heading", { name: /judges/i })).toBeVisible();
});

test("home and settings load without crash", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();
});
