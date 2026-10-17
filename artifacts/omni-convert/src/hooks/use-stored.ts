import { useEffect, useState } from "react";
import { readStoredValue, writeStoredValue } from "@/lib/storage";

/** Read a JSON value from localStorage with a safe fallback. */
export function readStore<T>(key: string, fallback: T): T {
  try {
    return readStoredValue(localStorage, key, fallback);
  } catch {
    return fallback;
  }
}

/** React state mirrored to localStorage, resilient to blocked storage. */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStore(key, initial));
  useEffect(() => {
    try {
      writeStoredValue(localStorage, key, value);
    } catch {
      /* Keep the current session usable if storage is blocked. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
