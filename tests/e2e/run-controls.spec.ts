import { expect, test } from "@playwright/test";
import { visibleStepHeading } from "./helpers";

/**
 * Control-flow smoke (plans/11 §3.2).
 */
test("run wizard exposes launch controls on review step", async ({ page }) => {
  await page.goto("/run?demo=1&step=4");
  await expect(visibleStepHeading(page, 4)).toBeVisible();
  await expect(page.locator("#main")).toBeVisible();
});

test("status live region exists globally", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-announcer")).toBeAttached();
});
