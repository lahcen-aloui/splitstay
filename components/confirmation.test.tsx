import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Confirmation } from "./confirmation";

let root: Root;
let host: HTMLDivElement;
let opener: HTMLButtonElement;
async function update(action: () => void) {
  await act(async () => { action(); await Promise.resolve(); });
}
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  opener = document.createElement("button"); opener.textContent = "Reset group"; document.body.append(opener); opener.focus();
  // jsdom has no native modal focus behavior; opening may replace pre-opening focus.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; this.tabIndex = -1; this.focus(); };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(async () => {
  await update(() => root.unmount()); host.remove(); opener.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function mount(onConfirm = () => undefined) {
  await update(() => root.render(createElement(Confirmation, { title: "Reset group?", description: "Restore sample expenses", action: "Reset to sample", onConfirm, onClose: () => root.render(null) })));
  const dialog = host.querySelector("dialog");
  const cancel = host.querySelector<HTMLButtonElement>("button.secondary");
  const confirm = host.querySelector<HTMLButtonElement>("button:not(.secondary)");
  if (!dialog || !cancel || !confirm) throw new Error("Missing confirmation controls");
  return { dialog, cancel, confirm };
}
async function pressTab(control: HTMLElement, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, ...options });
  await update(() => { control.focus(); control.dispatchEvent(event); });
  return event;
}
it("focuses Cancel after native modal opening changes focus", async () => {
  const { cancel } = await mount();
  expect(document.activeElement).toBe(cancel);
});
it("restores the actual opener after Cancel", async () => {
  const { cancel } = await mount();
  await update(() => cancel.click());
  expect(host.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});
it("restores the actual opener after native Escape cancellation", async () => {
  const { dialog } = await mount();
  const event = new Event("cancel", { cancelable: true });
  await update(() => dialog.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(host.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});
it("wraps Tab and Shift+Tab at confirmation boundaries without confirming", async () => {
  const onConfirm = vi.fn();
  const { cancel, confirm } = await mount(onConfirm);
  expect((await pressTab(confirm)).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(cancel);
  expect((await pressTab(cancel, { shiftKey: true })).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(confirm);
  expect(host.querySelector("dialog")?.open).toBe(true);
  expect(onConfirm).not.toHaveBeenCalled();
});
it("leaves native interior Tab movement and modified shortcuts alone", async () => {
  const { cancel, confirm } = await mount();
  expect((await pressTab(cancel)).defaultPrevented).toBe(false);
  expect((await pressTab(confirm, { shiftKey: true })).defaultPrevented).toBe(false);
  for (const options of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
    expect((await pressTab(confirm, options)).defaultPrevented).toBe(false);
  }
});
it("returns focus to a confirmation control when Tab starts on the dialog", async () => {
  const { dialog, cancel, confirm } = await mount();
  expect((await pressTab(dialog)).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(cancel);
  expect((await pressTab(dialog, { shiftKey: true })).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(confirm);
});
