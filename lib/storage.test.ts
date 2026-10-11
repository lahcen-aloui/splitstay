import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStored, writeStored } from "./storage";

interface DemoData {
  version: 1;
  label: string;
}

function decodeDemo(value: unknown): DemoData | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("version" in value) || value.version !== 1) return null;
  if (!("label" in value) || typeof value.label !== "string") return null;
  return { version: 1, label: value.label };
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("navigator", { locks: { request: (_key: string, action: () => unknown) => Promise.resolve().then(action) } });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("browser storage", () => {
  it("treats missing data as a clean first visit", () => {
    expect(readStored("demo", decodeDemo)).toEqual({ value: null, error: null });
  });

  it("reports unavailable browser storage when reading without a window", () => {
    vi.stubGlobal("window", undefined);
    expect(readStored("demo", decodeDemo).error).not.toBeNull();
  });

  it("reports unavailable browser storage when writing without a window", async () => {
    vi.stubGlobal("window", undefined);
    expect(await writeStored("demo", { version: 1, label: "Saved" }, null, decodeDemo)).not.toBeNull();
  });

  it("reports corrupted JSON", () => {
    localStorage.setItem("demo", "{");
    expect(readStored("demo", decodeDemo).error).not.toBeNull();
  });

  it("rejects an unsupported stored shape", () => {
    localStorage.setItem("demo", JSON.stringify({ version: 99 }));
    expect(readStored("demo", decodeDemo).value).toBeNull();
    expect(readStored("demo", decodeDemo).error).not.toBeNull();
  });

  it("writes and reads validated data", async () => {
    expect(await writeStored("demo", { version: 1, label: "Saved" }, null, decodeDemo)).toBeNull();
    expect(readStored("demo", decodeDemo)).toEqual({
      value: { version: 1, label: "Saved" }, error: null,
    });
  });

  it("reports denied access to the storage getter when reading", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(readStored("demo", decodeDemo).error).not.toBeNull();
  });

  it("reports denied access to the storage getter when writing", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(await writeStored("demo", { version: 1, label: "Saved" }, null, decodeDemo)).not.toBeNull();
  });

  it("reports a failed storage read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(readStored("demo", decodeDemo).error).not.toBeNull();
  });

  it("reports storage quota failure", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    expect(await writeStored("demo", { version: 1, label: "Saved" }, null, decodeDemo)).not.toBeNull();
  });

  it("reports a decoder exception", () => {
    localStorage.setItem("demo", "{}");
    expect(readStored("demo", () => { throw new Error("Invalid"); }).error).not.toBeNull();
  });

  it("reports a circular value that cannot be serialized", async () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(await writeStored("demo", circular, null, decodeDemo)).not.toBeNull();
    expect(localStorage.getItem("demo")).toBeNull();
  });

  it("rejects a value without a JSON representation", async () => {
    expect(await writeStored("demo", undefined, null, decodeDemo)).not.toBeNull();
    expect(localStorage.getItem("demo")).toBeNull();
  });
});
