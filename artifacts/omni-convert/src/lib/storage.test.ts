import assert from "node:assert/strict";
import test from "node:test";
import { readStoredValue, writeStoredValue, type KeyValueStore } from "./storage.ts";

class MemoryStorage implements KeyValueStore {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("favorites and recent history survive a page reload", () => {
  const storage = new MemoryStorage();
  const favorites = [
    { id: "length:m:ft", category: "length", amount: "2", from: "m", to: "ft", result: "6.5617", created: 100 },
  ];
  const history = [
    { id: "history-1", category: "currency", amount: "25", from: "USD", to: "JPY", result: "3750", created: 200 },
  ];

  assert.equal(writeStoredValue(storage, "omni-favorites", favorites), true);
  assert.equal(writeStoredValue(storage, "omni-history", history), true);

  const reloadedFavorites = readStoredValue(storage, "omni-favorites", []);
  const reloadedHistory = readStoredValue(storage, "omni-history", []);
  assert.deepEqual(reloadedFavorites, favorites);
  assert.deepEqual(reloadedHistory, history);
});

test("missing, malformed, and unavailable storage uses safe defaults", () => {
  const storage = new MemoryStorage();
  storage.setItem("broken", "{");
  assert.deepEqual(readStoredValue(storage, "missing", []), []);
  assert.deepEqual(readStoredValue(storage, "broken", []), []);

  const blockedStorage: KeyValueStore = {
    getItem() {
      throw new Error("Storage is blocked");
    },
    setItem() {
      throw new Error("Storage is blocked");
    },
  };
  assert.equal(readStoredValue(blockedStorage, "value", "fallback"), "fallback");
  assert.equal(writeStoredValue(blockedStorage, "value", "saved"), false);
});
