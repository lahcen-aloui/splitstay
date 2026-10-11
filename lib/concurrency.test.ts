import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { writeStored } from "./storage";
const decode = (value: unknown): { version: 1; ids: string[] } | null => {
  if (typeof value !== "object" || value === null || !("version" in value) || value.version !== 1 || !("ids" in value) || !Array.isArray(value.ids) || !value.ids.every(id => typeof id === "string")) return null;
  return { version: 1, ids: value.ids };
};
const first = { version: 1 as const, ids: ["a"] };
const second = { version: 1 as const, ids: ["b"] };
beforeEach(() => {
  localStorage.clear();
  let tail = Promise.resolve();
  vi.stubGlobal("navigator", { locks: { request: (_name: string, action: () => unknown) => {
    const result = tail.then(action); tail = result.then(() => undefined, () => undefined); return result;
  } } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("rejects stale tab additions instead of deleting the first tab's data", async () => {
  localStorage.setItem("demo", JSON.stringify(first));
  expect(await writeStored("demo", second, null, decode)).not.toBeNull();
  expect(localStorage.getItem("demo")).toBe('{"version":1,"ids":["a"]}');
});
it("serializes near-simultaneous seed/write attempts against the same baseline", async () => {
  const results = await Promise.all([writeStored("demo", first, null, decode), writeStored("demo", second, null, decode)]);
  expect(results.filter(result => result === null)).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem("demo") ?? "null")).toEqual(first);
});
it("does not resurrect deletion or reset from a stale failed-save retry", async () => {
  localStorage.setItem("demo", '{"version":1,"ids":[]}');
  expect(await writeStored("demo", first, JSON.stringify(second), decode)).not.toBeNull();
  expect(localStorage.getItem("demo")).toBe('{"version":1,"ids":[]}');
});
it("preserves a newly corrupted payload exactly", async () => {
  localStorage.setItem("demo", "{broken");
  expect(await writeStored("demo", first, "{broken", decode)).not.toBeNull();
  expect(localStorage.getItem("demo")).toBe("{broken");
});
it("rejects unsupported incoming data without modifying storage", async () => {
  expect(await writeStored("demo", { version: 99 }, null, decode)).not.toBeNull();
  expect(localStorage.getItem("demo")).toBeNull();
});
it("rejects stale reset confirmation even when reset is authorized", async () => {
  localStorage.setItem("demo", JSON.stringify(first));
  expect(await writeStored("demo", second, null, decode, true)).not.toBeNull();
  expect(localStorage.getItem("demo")).toBe(JSON.stringify(first));
});
it("permits explicit reset of the exact unreadable payload that was confirmed", async () => {
  localStorage.setItem("demo", "{broken");
  expect(await writeStored("demo", first, "{broken", decode, true)).toBeNull();
  expect(JSON.parse(localStorage.getItem("demo") ?? "null")).toEqual(first);
});
it("fails closed when browser serialization is unavailable", async () => {
  vi.stubGlobal("navigator", {});
  expect(await writeStored("demo", first, null, decode)).not.toBeNull();
  expect(localStorage.getItem("demo")).toBeNull();
});
