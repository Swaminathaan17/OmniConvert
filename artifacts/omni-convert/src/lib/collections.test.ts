import assert from "node:assert/strict";
import test from "node:test";
import {
  builtInCollections,
  createCollection,
  decodeCollection,
  decodeShareConfig,
  encodeCollection,
  encodeShareConfig,
  loadCollections,
  saveCollections,
  validateConversionConfig,
} from "./collections.ts";
import type { KeyValueStore } from "./storage.ts";

class MemoryStorage implements KeyValueStore {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("built-in presets only reference valid categories and units", () => {
  for (const collection of builtInCollections) {
    assert.ok(collection.items.length > 0, collection.id);
    for (const item of collection.items) {
      assert.deepEqual(validateConversionConfig(item), [], `${collection.id}: ${item.from}->${item.to}`);
    }
  }
});

test("configuration validation rejects unknown units and categories", () => {
  assert.ok(validateConversionConfig({ category: "nope", from: "a", to: "b" }).length > 0);
  assert.ok(validateConversionConfig({ category: "length", from: "m", to: "banana" }).length > 0);
  assert.deepEqual(validateConversionConfig({ category: "currency", from: "USD", to: "EUR" }), []);
});

test("custom unit symbols can be whitelisted during validation", () => {
  const issues = validateConversionConfig(
    { category: "length", from: "smoot", to: "m" },
    { length: ["smoot"] },
  );
  assert.deepEqual(issues, []);
});

test("collections persist through versioned storage", () => {
  const storage = new MemoryStorage();
  const collection = createCollection("My set", "A test", [
    { category: "length", from: "m", to: "ft" },
  ]);
  assert.equal(saveCollections(storage, [collection]), true);
  const reloaded = loadCollections(storage);
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0]!.name, "My set");
});

test("malformed stored collections fall back to an empty list", () => {
  const storage = new MemoryStorage();
  storage.setItem("omni-collections", "{{{");
  assert.deepEqual(loadCollections(storage), []);
  storage.setItem("omni-collections", JSON.stringify({ version: 1, data: [{ id: 1 }] }));
  assert.deepEqual(loadCollections(storage), []);
});

test("share config encodes, decodes, and rejects unsafe input", () => {
  const config = { category: "length", from: "km", to: "mi", amount: "5", precision: 2 };
  const token = encodeShareConfig(config);
  assert.deepEqual(decodeShareConfig(token), config);

  assert.equal(decodeShareConfig("!!!not-base64!!!"), null);
  assert.equal(decodeShareConfig(""), null);
  assert.equal(decodeShareConfig("A".repeat(5000)), null);
  const extra = encodeShareConfig({ ...config, secret: "nope" } as never);
  assert.equal(decodeShareConfig(extra), null);
});

test("collection share tokens round-trip and validate strictly", () => {
  const collection = createCollection("Travel kit", "On the road", [
    { category: "length", from: "km", to: "mi" },
    { category: "temperature", from: "°C", to: "°F" },
  ]);
  const decoded = decodeCollection(encodeCollection(collection));
  assert.ok(decoded);
  assert.equal(decoded.name, "Travel kit");
  assert.equal(decoded.items.length, 2);
  assert.equal(decodeCollection("garbage"), null);
});
