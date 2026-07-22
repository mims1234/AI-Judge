import type { Page } from "@playwright/test";

/**
 * WizardStepper puts `step-heading-N` on a md:hidden caption (hidden on desktop)
 * and step bodies also use the same testid (Q-F04). Prefer the visible node.
 */
export function visibleStepHeading(page: Page, step: number) {
  return page
    .locator(`[data-testid="step-heading-${step}"]`)
    .filter({ visible: true });
}
