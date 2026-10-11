"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { readSnapshot, writeStored } from "./storage";
import { en } from "@/locales/en";

export function useLocalStore<T>(key: string, decode: (value: unknown) => T | null, initial: () => T, empty: T, seed: boolean) {
  const [value, setValue] = useState<T>(empty);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const baseline = useRef<string | null | undefined>(undefined);
  const writing = useRef(false);
  const latest = useRef(value);

  const save = useCallback(async (next: T, reset = false, expected = baseline.current): Promise<boolean> => {
    if (writing.current) return false;
    writing.current = true; setBusy(true);
    const problem = await writeStored(key, next, expected, decode, reset);
    writing.current = false; setBusy(false); setError(problem);
    if (problem) {
      if (problem === en.storage.writeFailed || problem === en.storage.coordination) {
        if (!reset) { latest.current = next; setValue(next); }
      } else setBlocked(true);
      return false;
    }
    baseline.current = JSON.stringify(next);
    latest.current = next; setValue(next); setBlocked(false);
    return true;
  }, [key, decode]);

  const load = useCallback(async (): Promise<boolean> => {
    if (writing.current) return false;
    const stored = readSnapshot(key, decode);
    baseline.current = stored.raw;
    setReady(true); setError(stored.error); setBlocked(Boolean(stored.error));
    if (stored.error) return false;
    const next = stored.value ?? initial();
    latest.current = next; setValue(next);
    if (!stored.value && seed) return save(next);
    return true;
  }, [key, decode, initial, seed, save]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    const changed = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || (event.key !== key && event.key !== null)) return;
      const current = readSnapshot(key, decode);
      if (current.raw === baseline.current && !current.error) return;
      setBlocked(true); setError(current.error ?? en.storage.conflict);
    };
    window.addEventListener("storage", changed);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", changed); };
  }, [key, decode, load]);

  return { value, ready, blocked, error, busy, save, load, retry: () => save(latest.current), baseline: () => baseline.current };
}
