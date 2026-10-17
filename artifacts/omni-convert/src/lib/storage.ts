export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
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

/** Read and JSON-parse a key, returning `undefined` for missing/invalid data. */
export function readStoredJson(
  storage: Pick<KeyValueStore, "getItem">,
  key: string,
): unknown {
  try {
    const value = storage.getItem(key);
    if (value === null) return undefined;
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function removeStoredValue(
  storage: Pick<KeyValueStore, "removeItem">,
  key: string,
): boolean {
  try {
    storage.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}

export interface VersionedMigration<T> {
  /** Current schema version expected by the application. */
  version: number;
  fallback: T;
  /** Validate a value at the current version. */
  validate: (value: unknown) => value is T;
  /** Optionally upgrade older payloads; return null to discard them. */
  migrate?: (raw: unknown, fromVersion: number) => T | null;
}

interface VersionedEnvelope {
  version: number;
  data: unknown;
}

function isEnvelope(value: unknown): value is VersionedEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    "data" in value &&
    typeof (value as { version: unknown }).version === "number"
  );
}

/**
 * Read a versioned payload, migrating or discarding incompatible data safely.
 * Malformed or unavailable storage always degrades to the provided fallback.
 */
export function readVersioned<T>(
  storage: Pick<KeyValueStore, "getItem">,
  key: string,
  migration: VersionedMigration<T>,
): T {
  const raw = readStoredJson(storage, key);
  if (raw === undefined) return migration.fallback;

  const envelope = isEnvelope(raw) ? raw : { version: 0, data: raw };
  try {
    if (envelope.version === migration.version) {
      return migration.validate(envelope.data) ? envelope.data : migration.fallback;
    }
    const migrated = migration.migrate?.(envelope.data, envelope.version) ?? null;
    return migrated !== null && migration.validate(migrated) ? migrated : migration.fallback;
  } catch {
    return migration.fallback;
  }
}

export function writeVersioned(
  storage: Pick<KeyValueStore, "setItem">,
  key: string,
  version: number,
  data: unknown,
): boolean {
  return writeStoredValue(storage, key, { version, data });
}
