export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredValue<T>(
  storage: Pick<KeyValueStore, "getItem">,
  key: string,
  fallback: T,
): T {
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}

export function writeStoredValue(
  storage: Pick<KeyValueStore, "setItem">,
  key: string,
  value: unknown,
): boolean {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return false;
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}
