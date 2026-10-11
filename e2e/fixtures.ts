import { expect, test as base, type Locator, type Page } from "@playwright/test";
export { expect } from "@playwright/test";
declare global {
  interface Window { restoreStorageWrites?: () => void; releaseStorageLock?: () => void; storageLockHeld?: boolean }
}
export const test = base.extend<{ runtimeErrors: void }>({
  runtimeErrors: [async ({ context }, use) => {
    const errors: string[] = [];
    const collect = (page: Page) => page.on("pageerror", error => errors.push(error.message));
    context.pages().forEach(collect); context.on("page", collect);
    await use();
    context.off("page", collect);
    expect(errors, "No application runtime errors in any page").toEqual([]);
  }, { auto: true }],
});
export async function denyWrites(page: Page) {
  await page.evaluate(() => {
    // Keep the unbound prototype method so restoration retains its storage receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = Storage.prototype.setItem;
    window.restoreStorageWrites = () => { Storage.prototype.setItem = original; delete window.restoreStorageWrites; };
    Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
  });
}
export async function restoreWrites(page: Page) {
  await page.evaluate(() => {
    if (!window.restoreStorageWrites) throw new Error("No failed storage override to restore");
    window.restoreStorageWrites();
  });
}
export async function dismissWithKeyboard(page: Page, opener: Locator, initialFocus: Locator) {
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible(); await expect(initialFocus).toBeFocused();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
}
export async function holdWrites(page: Page, key: string) {
  await page.evaluate(key => {
    window.storageLockHeld = false;
    void navigator.locks.request(key, () => new Promise<void>(resolve => { window.releaseStorageLock = resolve; window.storageLockHeld = true; }));
  }, key);
  await expect.poll(() => page.evaluate(() => window.storageLockHeld)).toBe(true);
}
export async function releaseWrites(page: Page, key: string) {
  await expect.poll(() => page.evaluate(async key => (await navigator.locks.query()).pending?.filter(lock => lock.name === key).length, key)).toBe(2);
  await page.evaluate(() => { if (!window.releaseStorageLock) throw new Error("No held lock"); window.releaseStorageLock(); });
}
