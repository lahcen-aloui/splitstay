import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeGroup } from "@/lib/group";
import { Dashboard } from "./dashboard";
let root: Root;
let host: HTMLDivElement;
async function update(action: () => void) {
  await act(async () => { action(); await Promise.resolve(); });
}
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers(); localStorage.clear();
  vi.stubGlobal("navigator", { locks: { request: (_key: string, action: () => unknown) => Promise.resolve().then(action) } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(async () => { await update(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount() { await update(() => root.render(createElement(Dashboard))); await update(() => vi.runOnlyPendingTimers()); }
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(button => button.textContent === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  await update(() => button.click());
}
async function fill(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Missing input: ${selector}`);
  await update(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
it("clears expense and participant drafts, selection, and errors only after successful reset", async () => {
  localStorage.setItem("splitstay.group.v1", JSON.stringify({ version: 1, participants: [{ id: "alex", name: "Alex" }, { id: "bea", name: "Bea" }], expenses: [] }));
  await mount(); await fill('input[placeholder="For example, dinner"]', "Draft dinner"); await fill('input[inputmode="decimal"]', "bad"); await fill(".participant-panel input", "Draft person");
  const payer = host.querySelector<HTMLSelectElement>("select");
  await update(() => { if (!payer) throw new Error("Missing payer"); payer.value = "bea"; payer.dispatchEvent(new Event("change", { bubbles: true })); });
  await update(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
  await update(() => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await click("Reset group"); await click("Cancel");
  expect(host.querySelector<HTMLInputElement>('input[placeholder="For example, dinner"]')?.value).toBe("Draft dinner");
  await click("Reset group"); await click("Reset to sample");
  expect(host.querySelector<HTMLInputElement>('input[placeholder="For example, dinner"]')?.value).toBe("");
  expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe("alex");
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  expect(host.querySelector(".form-error")).toBeNull();
  expect(host.querySelector<HTMLInputElement>(".participant-panel input")?.value).toBe("");
});

it("keeps drafts, validation errors and payer/exclusions when reset fails", async () => {
  await mount(); await fill('input[placeholder="For example, dinner"]', "Keep dinner"); await fill('input[inputmode="decimal"]', "bad");
  await fill(".participant-panel input", "Keep person");
  await update(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
  await update(() => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  await click("Reset group"); await click("Reset to sample");
  expect(host.querySelector("dialog")).not.toBeNull();
  expect(host.querySelector<HTMLInputElement>('input[placeholder="For example, dinner"]')?.value).toBe("Keep dinner");
  expect(host.querySelector<HTMLInputElement>(".participant-panel input")?.value).toBe("Keep person");
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
  expect(host.querySelector(".form-error")).not.toBeNull();
  failure.mockRestore(); await click("Reset to sample");
  expect(host.querySelector("dialog")).toBeNull();
  expect(host.querySelector<HTMLInputElement>(".participant-panel input")?.value).toBe("");
});
it("keeps pending reset focus contained and restores the enabled opener after saving", async () => {
  await mount();
  const pending = Promise.withResolvers<void>();
  vi.stubGlobal("navigator", { locks: { request: async (_key: string, action: () => unknown) => { await pending.promise; return action(); } } });
  const opener = [...host.querySelectorAll("button")].find(button => button.textContent === "Reset group");
  if (!opener) throw new Error("Missing reset opener");
  opener.focus(); await click("Reset group"); await click("Reset to sample");
  const dialog = host.querySelector("dialog");
  if (!dialog) throw new Error("Missing pending reset dialog");
  expect([...dialog.querySelectorAll("button")].every(button => button.disabled)).toBe(true);
  expect(opener.disabled).toBe(true);
  for (const shiftKey of [false, true]) {
    const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
    await update(() => dialog.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);
  }
  await update(() => dialog.dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(host.querySelector("dialog")).toBe(dialog);
  await update(() => pending.resolve());
  expect(host.querySelector("dialog")).toBeNull();
  expect(opener.disabled).toBe(false);
  expect(document.activeElement).toBe(opener);
  const saved: unknown = JSON.parse(localStorage.getItem("splitstay.group.v1") ?? "null");
  expect(decodeGroup(saved)?.expenses.map(expense => expense.id)).toEqual(["apartment", "dinner", "groceries"]);
});
it("unsuccessful expense and participant submission retains drafts and resubmission saves each once", async () => {
  await mount();
  const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  await fill('input[placeholder="For example, dinner"]', "Retry dinner"); await fill('input[inputmode="decimal"]', "12.34");
  await click("Add expense");
  expect(host.querySelector<HTMLInputElement>('input[placeholder="For example, dinner"]')?.value).toBe("Retry dinner");
  await fill(".participant-panel input", "Retry person"); await click("Add participant");
  expect(host.querySelector<HTMLInputElement>(".participant-panel input")?.value).toBe("Retry person");
  failure.mockRestore(); await click("Add expense"); await click("Add participant");
  const persisted: unknown = JSON.parse(localStorage.getItem("splitstay.group.v1") ?? "null");
  const decoded = decodeGroup(persisted);
  expect(decoded).not.toBeNull();
  expect(decoded?.participants.filter(participant => participant.name === "Retry person")).toHaveLength(1);
  const dinners = decoded?.expenses.filter(expense => expense.description === "Retry dinner");
  expect(dinners).toHaveLength(1); expect(dinners?.[0]?.amountCents).toBe(1234);
  expect(dinners?.[0]?.payerId).toBe("alex");

  const payload = localStorage.getItem("splitstay.group.v1") ?? "";
  expect(payload.match(/Retry dinner/g)).toHaveLength(1); expect(payload.match(/Retry person/g)).toHaveLength(1);
  expect(host.querySelector<HTMLInputElement>('input[placeholder="For example, dinner"]')?.value).toBe("");
  expect(host.querySelector<HTMLInputElement>(".participant-panel input")?.value).toBe("");
});
