import { expect, test } from "@playwright/test";
import { signInDev } from "./helpers";

test("rules ack is required once per tab, then skipped", async ({ page }) => {
  await signInDev(page);
  await page.goto("/bundles/new");
  await expect(page.getByTestId("pack-rules")).toBeVisible();
  await expect(page.getByTestId("pack-brief")).toHaveCount(0);

  await page.getByTestId("pack-rules-ack").check();
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByTestId("pack-brief")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("pack-brief")).toBeVisible();
  await expect(page.getByTestId("pack-rules")).toHaveCount(0);
});
