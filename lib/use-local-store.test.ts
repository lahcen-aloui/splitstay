import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLocalStore } from "./use-local-store";
interface Data { version: 1; ids: string[] }
const empty: Data = { version: 1, ids: [] };
const initial = () => empty;
function decode(value: unknown): Data | null {
  if (typeof value !== "object" || value === null || !("version" in value) || value.version !== 1 || !("ids" in value) || !Array.isArray(value.ids) || !value.ids.every(id => typeof id === "string")) return null;
  return { version: 1, ids: value.ids };
}
let store: ReturnType<typeof useLocalStore<Data>>;
let root: Root;
let host: HTMLDivElement;
function Harness() {
  const current = useLocalStore("demo", decode, initial, empty, false);
  useEffect(() => { store = current; }, [current]);
  return createElement("p", null, current.value.ids.join(","));
}
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); localStorage.clear();
  let tail = Promise.resolve();
  vi.stubGlobal("navigator", { locks: { request: (_name: string, action: () => unknown) => { const result = tail.then(action); tail = result.then(() => undefined, () => undefined); return result; } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(createElement(Harness)); await Promise.resolve(); });
  await act(async () => { vi.runOnlyPendingTimers(); await Promise.resolve(); });
});
afterEach(async () => { await act(async () => { root.unmount(); await Promise.resolve(); }); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function save(next: Data, reset = false): Promise<boolean> {
  let success = false; await act(async () => { success = await store.save(next, reset); }); return success;
}
async function external(raw: string) {
  localStorage.setItem("demo", raw);
  await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: "demo", newValue: raw, storageArea: localStorage })); await Promise.resolve(); });
}
it("failed save retains pending state, successful retry clears the error and persists that state", async () => {
  const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  expect(await save({ version: 1, ids: ["pending"] })).toBe(false);
  expect(host.textContent).toBe("pending"); expect(store.error).not.toBeNull();
  failure.mockRestore();
  await act(async () => { expect(await store.retry()).toBe(true); });
  expect(store.error).toBeNull(); expect(localStorage.getItem("demo")).toBe('{"version":1,"ids":["pending"]}');
});
it("external changes block saving without replacing in-memory unsaved data", async () => {
  const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  await save({ version: 1, ids: ["pending"] }); failure.mockRestore();
  await external('{"version":1,"ids":["other-tab"]}');
  expect(host.textContent).toBe("pending"); expect(store.blocked).toBe(true);
  await act(async () => { expect(await store.retry()).toBe(false); });
  expect(host.textContent).toBe("pending"); expect(localStorage.getItem("demo")).toBe('{"version":1,"ids":["other-tab"]}');
});
it("only an explicit load discards pending state for the newer validated payload", async () => {
  await save({ version: 1, ids: ["old"] }); await external('{"version":1,"ids":["new"]}');
  expect(host.textContent).toBe("old");
  await act(async () => { expect(await store.load()).toBe(true); });
  expect(host.textContent).toBe("new"); expect(store.blocked).toBe(false); expect(store.error).toBeNull();
});
it("new corrupt data is preserved and keeps in-memory state through a failed load", async () => {
  await save({ version: 1, ids: ["draft"] }); await external("{broken");
  expect(host.textContent).toBe("draft"); expect(store.blocked).toBe(true);
  await act(async () => { expect(await store.load()).toBe(false); });
  expect(host.textContent).toBe("draft");
  expect(await save(empty)).toBe(false); expect(localStorage.getItem("demo")).toBe("{broken");
});
it("failed reset preserves the existing state and pending retry snapshot", async () => {
  await save({ version: 1, ids: ["keep"] });
  const original = localStorage.getItem("demo");
  const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  expect(await save(empty, true)).toBe(false); expect(host.textContent).toBe("keep"); expect(localStorage.getItem("demo")).toBe(original);
  failure.mockRestore(); await act(async () => { expect(await store.retry()).toBe(true); });
  expect(host.textContent).toBe("keep"); expect(localStorage.getItem("demo")).toBe(original);
});
it("rejects a stale confirmed reset even when no storage event has arrived", async () => {
  await save({ version: 1, ids: ["baseline"] });
  localStorage.setItem("demo", '{"version":1,"ids":["newer"]}');
  expect(await save(empty, true)).toBe(false); expect(host.textContent).toBe("baseline");
  expect(localStorage.getItem("demo")).toBe('{"version":1,"ids":["newer"]}');
});
it("does not treat unreadable storage access as a first visit or permit reset", async () => {
  await save({ version: 1, ids: ["keep"] });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
  await act(async () => { expect(await store.load()).toBe(false); });
  expect(host.textContent).toBe("keep"); expect(await save(empty, true)).toBe(false);
});
