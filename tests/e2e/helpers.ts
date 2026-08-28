import { expect, type Page } from "@playwright/test";

/**
 * WizardStepper puts `step-heading-N` on a md:hidden caption (hidden on desktop)
 * and step bodies also use the same testid (Q-F04). Prefer the visible node.
 */
export function visibleStepHeading(page: Page, step: number) {
  return page
    .locator(`[data-testid="step-heading-${step}"]`)
    .filter({ visible: true });
}

/** Dev credentials provider — only registered when AI_JUDGE_MODE=dev. */
export async function signInDev(page: Page) {
  await page.goto("/");
  const already = page.getByTestId("signed-in-user");
  if (await already.isVisible().catch(() => false)) return;
  await page.getByTestId("dev-signin").click();
  await expect(page.getByTestId("signed-in-user")).toBeVisible({
    timeout: 15_000,
  });
}
