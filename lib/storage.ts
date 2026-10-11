import { en } from "@/locales/en";

interface StorageResult<T> {
  value: T | null;
  error: string | null;
}

function decodeStored<T>(raw: string, decode: (value: unknown) => T | null): StorageResult<T> {
  try {
    const parsed: unknown = JSON.parse(raw);
    const value = decode(parsed);
    if (value === null) return { value: null, error: en.storage.unsupported };
    return { value, error: null };
  } catch {
    return { value: null, error: en.storage.malformed };
  }
}

export function readSnapshot<T>(key: string, decode: (value: unknown) => T | null): StorageResult<T> & { raw: string | null | undefined } {
  if (typeof window === "undefined") return { value: null, error: en.storage.unavailable, raw: undefined };
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return { value: null, error: null, raw };
    return { ...decodeStored(raw, decode), raw };
  } catch {
    return { value: null, error: en.storage.unavailable, raw: undefined };
  }
}

export function readStored<T>(key: string, decode: (value: unknown) => T | null): StorageResult<T> {
  const { value, error } = readSnapshot(key, decode);
  return { value, error };
}

// Compare and validate inside the origin-wide lock, including retries and resets.
export async function writeStored<T>(key: string, value: unknown, expected: string | null | undefined, decode: (value: unknown) => T | null, reset = false): Promise<string | null> {
  if (typeof window === "undefined") return en.storage.unavailable;
  if (!navigator.locks) return en.storage.coordination;
  try {
    return await navigator.locks.request(key, () => {
      const current = readSnapshot(key, decode);
      if (current.raw === undefined) return current.error;
      if (expected === undefined || current.raw !== expected) return en.storage.conflict;
      if (current.error && !reset) return current.error;
      let serialized: string | undefined;
      try {
        serialized = JSON.stringify(value);
        if (serialized === undefined) return en.storage.unserializable;
        const decoded = decodeStored(serialized, decode);
        if (decoded.error) return decoded.error;
      } catch {
        return en.storage.unserializable;
      }
      try {
        window.localStorage.setItem(key, serialized);
        return null;
      } catch {
        return en.storage.writeFailed;
      }
    });
  } catch {
    return en.storage.coordination;
  }
}
