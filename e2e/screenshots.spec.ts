import { expect, test } from "./fixtures";

test("captures the actual demo after rendering", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A shared trip. A clear ledger.", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekend apartment", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `docs/screenshots/${mobile ? "mobile" : "desktop"}.png`, fullPage: true });
});
