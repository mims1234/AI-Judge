import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`responsive ${vp.name} (${vp.width})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const path of ["/", "/run?demo=1", "/leaderboard?demo=1", "/models?demo=1"]) {
      test(`no horizontal overflow on ${path}`, async ({ page }) => {
        await page.goto(path);
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return {
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
          };
        });
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      });
    }
  });
}
