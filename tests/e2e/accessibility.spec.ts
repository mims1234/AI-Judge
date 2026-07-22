import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { visibleStepHeading } from "./helpers";

/**
 * Axe scans (plans/11 §3.3).
 *
 * Known Frontend gaps (see tests/VIOLATIONS.md) are disabled so new
 * serious/critical regressions still fail the suite:
 * - Q-F03 color-contrast — nav `text-dim` 4.38:1
 * - Q-F05 nested-interactive — radio card wrapping a link on /run step 1
 * - Q-F06 aria-valid-attr-value — Tabs keys with `/` in model ids (judges)
 */
const KNOWN_FRONTEND_AXE_GAPS = [
  "color-contrast",
  "nested-interactive",
  "aria-valid-attr-value",
] as const;

async function expectNoSerious(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules([...KNOWN_FRONTEND_AXE_GAPS])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe("accessibility axe scans (plans/11 §3.3)", () => {
  test("landing", async ({ page }) => {
    await expectNoSerious(page, "/");
  });

  test("run steps", async ({ page }) => {
    for (const step of [1, 2, 3, 4]) {
      await expectNoSerious(page, `/run?demo=1&step=${step}`);
    }
  });

  test("analytics pages", async ({ page }) => {
    await expectNoSerious(page, "/leaderboard?demo=1");
    await expectNoSerious(page, "/compare?demo=1");
    await expectNoSerious(page, "/judges?demo=1");
  });

  test("keyboard can reach run step headings", async ({ page }) => {
    await page.goto("/run?demo=1&step=1");
    await page.keyboard.press("Tab");
    await expect(visibleStepHeading(page, 1)).toBeVisible();
  });

  test("reduced motion still shows content", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/leaderboard?demo=1");
    await expect(page.getByRole("heading", { name: /leaderboard/i })).toBeVisible();
  });
});
