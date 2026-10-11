import { type Page } from "@playwright/test";
import { denyWrites, restoreWrites, holdWrites, releaseWrites, expect, test } from "./fixtures";
const key = "splitstay.group.v1";
async function open(page: Page) { await page.goto("/"); await expect(page.getByRole("button", { name: "Add participant", exact: true })).toBeEnabled(); }
async function add(page: Page, name: string) { await page.getByLabel("Participant name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Add participant", exact: true }).click(); }
async function saved(page: Page, name: string) { await expect(page.getByRole("button", { name: `Remove participant ${name}`, exact: true })).toBeVisible(); }
async function removeAlpha(page: Page) { await page.getByRole("button", { name: "Remove participant Tab Alpha", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove participant", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove participant Tab Alpha", exact: true })).toHaveCount(0); }
const payload = (page: Page) => page.evaluate(key => localStorage.getItem(key), key);
const conflict = (page: Page) => page.getByRole("alert").filter({ hasText: "Saved data changed in another tab" });
async function latest(page: Page) {
  await page.getByRole("button", { name: "Discard drafts and load saved data", exact: true }).click();
}

test("same-origin pages protect additions and deletion, with explicit loading of latest data", async ({ page, context }) => {
  await open(page); const second = await context.newPage(); await open(second);
  await add(page, "Tab Alpha"); await saved(page, "Tab Alpha");
  await expect(conflict(second)).toBeVisible();
  await latest(second); await add(second, "Tab Beta"); await saved(second, "Tab Beta");
  expect(await payload(second)).toContain("Tab Alpha"); expect(await payload(second)).toContain("Tab Beta");
  await latest(page); await removeAlpha(page);
  await expect(conflict(second)).toBeVisible();
  await latest(second);
  expect(await payload(second)).not.toContain("Tab Alpha"); expect(await payload(second)).toContain("Tab Beta");
  await second.reload(); await saved(second, "Tab Beta");
});

test("near-simultaneous writers cannot both save the same baseline even before storage events", async ({ page, context }) => {
  await open(page); const second = await context.newPage();
  await second.addInitScript(() => window.addEventListener("storage", event => event.stopImmediatePropagation()));
  await open(second); await holdWrites(page, key);
  await add(page, "Tab Alpha"); await add(second, "Tab Beta");
  await releaseWrites(page, key);
  await saved(page, "Tab Alpha"); await expect(conflict(second)).toBeVisible();
  await expect(second.getByLabel("Participant name", { exact: true })).toHaveValue("Tab Beta");
  expect(await payload(page)).toContain("Tab Alpha"); expect(await payload(page)).not.toContain("Tab Beta");
});

test("a stale failed-save retry preserves pending drafts and cannot overwrite another page", async ({ page, context }) => {
  await open(page); const second = await context.newPage();
  await second.addInitScript(() => window.addEventListener("storage", event => event.stopImmediatePropagation()));
  await open(second); await denyWrites(second); await add(second, "Tab Beta");
  await expect(second.getByRole("alert").filter({ hasText: "Changes could not be saved" })).toBeVisible();
  await expect(second.getByLabel("Participant name", { exact: true })).toHaveValue("Tab Beta");
  await add(page, "Tab Alpha"); await saved(page, "Tab Alpha"); await restoreWrites(second);
  await second.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(conflict(second)).toBeVisible();
  expect(await payload(second)).toContain("Tab Alpha"); expect(await payload(second)).not.toContain("Tab Beta");
  await latest(second); await add(second, "Tab Beta"); await saved(second, "Tab Beta");
  expect(await payload(second)).toContain("Tab Alpha"); expect(await payload(second)).toContain("Tab Beta");
  await second.reload(); await saved(second, "Tab Beta");
});

test("external changes preserve failed-save pending data and form drafts", async ({ page, context }) => {
  await open(page); const second = await context.newPage(); await open(second);
  await denyWrites(second); await add(second, "Tab Beta");
  await expect(second.getByRole("alert").filter({ hasText: "Changes could not be saved" })).toBeVisible();
  await add(page, "Tab Alpha"); await saved(page, "Tab Alpha");
  await expect(conflict(second)).toBeVisible();
  await expect(second.getByLabel("Participant name", { exact: true })).toHaveValue("Tab Beta");
  expect(await payload(page)).not.toContain("Tab Beta");
});

test("preserves newly corrupt data and rejects a stale reset confirmation", async ({ page, context }) => {
  await open(page); const second = await context.newPage();
  await second.addInitScript(() => window.addEventListener("storage", event => event.stopImmediatePropagation()));
  await open(second);
  await page.evaluate(key => localStorage.setItem(key, "{broken"), key);
  await add(second, "Tab Beta"); await expect(conflict(second)).toBeVisible();
  expect(await payload(second)).toBe("{broken");
  await latest(second);
  await expect(second.getByRole("alert").filter({ hasText: "Saved data could not be read" })).toBeVisible();
  await second.getByRole("button", { name: "Reset group", exact: true }).click();
  await second.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await payload(second)).toBe("{broken");
  await second.getByRole("button", { name: "Reset group", exact: true }).click();
  // A newer valid payload arrives after B's confirmation opened.
  await page.evaluate(({ key, valid }) => localStorage.setItem(key, valid), { key, valid: '{"version":1,"participants":[{"id":"alex","name":"Alex"}],"expenses":[]}' });
  await second.getByRole("dialog").getByRole("button", { name: "Reset to sample", exact: true }).click();
  await expect(conflict(second)).toBeVisible();
  expect(await payload(second)).toBe('{"version":1,"participants":[{"id":"alex","name":"Alex"}],"expenses":[]}');
  await second.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
});

test("an actual reset in one page cannot be resurrected by another page's pending retry", async ({ page, context }) => {
  await open(page); const second = await context.newPage();
  await second.addInitScript(() => window.addEventListener("storage", event => event.stopImmediatePropagation()));
  await open(second); await denyWrites(second); await add(second, "Tab Beta");
  await expect(second.getByRole("alert").filter({ hasText: "Changes could not be saved" })).toBeVisible();
  await page.evaluate(key => localStorage.setItem(key, "{bad"), key);
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Saved data could not be read" })).toBeVisible();
  await page.getByRole("button", { name: "Reset group", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset to sample", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await add(page, "Tab Alpha"); await saved(page, "Tab Alpha");
  const afterReset = await payload(page);
  await restoreWrites(second);
  await second.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(conflict(second)).toBeVisible();
  expect(await payload(second)).toBe(afterReset); expect(afterReset).not.toContain("Tab Beta");
  await second.reload(); await saved(second, "Tab Alpha");
});
