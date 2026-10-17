import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOM_UNITS_KEY,
  CUSTOM_UNITS_VERSION,
  convertBetweenOptions,
  createCustomUnit,
  customUnitModel,
  loadCustomUnits,
  parseCustomUnitsDocument,
  saveCustomUnits,
  serializeCustomUnits,
  unitOptionsFor,
  updateCustomUnit,
  validateCustomUnitInput,
  type CustomUnit,
} from "./custom-units.ts";
import { categoryById } from "./units.ts";
import type { KeyValueStore } from "./storage.ts";

class MemoryStorage implements KeyValueStore {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  raw(key: string) {
    return this.values.get(key);
  }
}

const baseInput = {
  name: "Smoot",
  symbol: "smoot",
  dimension: "length",
  scale: 1.7018,
  offset: 0,
  precision: 4,
};

test("valid custom units are accepted and normalised", () => {
  const result = validateCustomUnitInput(baseInput);
  assert.equal(result.ok, true);
  assert.equal(result.value?.symbol, "smoot");
});

test("rejects duplicate symbols, built-in clashes, and duplicate names", () => {
  const existing = [createCustomUnit(baseInput)];
  assert.equal(validateCustomUnitInput(baseInput, { existing }).errors.symbol !== undefined, true);
  assert.equal(
    validateCustomUnitInput({ ...baseInput, name: "Another", symbol: "m" }).errors.symbol !== undefined,
    true,
  );
  assert.equal(
    validateCustomUnitInput({ ...baseInput, name: "Smoot", symbol: "other" }, { existing }).errors.name !== undefined,
    true,
  );
});

test("enforces dimensional rules for offsets and fuel economy", () => {
  assert.ok(validateCustomUnitInput({ ...baseInput, offset: 5 }).errors.offset);
  assert.ok(validateCustomUnitInput({ ...baseInput, dimension: "fuel", symbol: "x" }).errors.dimension);
  const rankine = validateCustomUnitInput({
    name: "Rankine",
    symbol: "°R",
    dimension: "temperature",
    scale: 5 / 9,
    offset: 0,
    precision: 2,
  });
  assert.equal(rankine.ok, true);
  const reaumur = validateCustomUnitInput({
    name: "Réaumur",
    symbol: "°Ré",
    dimension: "temperature",
    scale: 1.25,
    offset: 273.15,
    precision: 2,
  });
  assert.equal(reaumur.ok, true);
});

test("rejects non-finite and invalid scales", () => {
  assert.ok(validateCustomUnitInput({ ...baseInput, scale: 0 }).errors.scale);
  assert.ok(validateCustomUnitInput({ ...baseInput, scale: -2 }).errors.scale);
  assert.ok(validateCustomUnitInput({ ...baseInput, scale: Number.NaN }).errors.scale);
  assert.ok(validateCustomUnitInput({ ...baseInput, precision: 20 }).errors.precision);
});

test("custom units persist and reload through versioned storage", () => {
  const storage = new MemoryStorage();
  const unit = createCustomUnit(baseInput);
  assert.equal(saveCustomUnits(storage, [unit]), true);
  const reloaded = loadCustomUnits(storage);
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0]!.symbol, "smoot");
  assert.ok(storage.raw(CUSTOM_UNITS_KEY));
});

test("corrupt or unsupported persisted data degrades safely", () => {
  const storage = new MemoryStorage();
  storage.setItem(CUSTOM_UNITS_KEY, "{ not json");
  assert.deepEqual(loadCustomUnits(storage), []);

  storage.setItem(CUSTOM_UNITS_KEY, JSON.stringify({ version: CUSTOM_UNITS_VERSION, data: [{ bogus: true }] }));
  assert.deepEqual(loadCustomUnits(storage), []);

  storage.setItem(
    CUSTOM_UNITS_KEY,
    JSON.stringify({ version: 99, data: [] }),
  );
  assert.deepEqual(loadCustomUnits(storage), []);
});

test("a custom unit converts identically to the shared engine", () => {
  const length = categoryById("length")!;
  const unit = createCustomUnit({ ...baseInput, scale: 1000, symbol: "kilo-smoot", name: "Kilosmoot" });
  const options = unitOptionsFor(length, [unit]);
  const meter = options.find((option) => option.symbol === "m")!;
  const custom = options.find((option) => option.symbol === "kilo-smoot")!;
  assert.ok(custom.source === "custom");

  assert.equal(convertBetweenOptions(length, 2, custom, meter), 2000);
  assert.equal(convertBetweenOptions(length, 2000, meter, custom), 2);
});

test("temperature custom units use affine conversion and enforce absolute zero", () => {
  const temperature = categoryById("temperature")!;
  const rankine = createCustomUnit({
    name: "Rankine",
    symbol: "°R",
    dimension: "temperature",
    scale: 5 / 9,
    offset: 0,
    precision: 2,
  });
  const options = unitOptionsFor(temperature, [rankine]);
  const kelvin = options.find((option) => option.symbol === "K")!;
  const rankineOption = options.find((option) => option.symbol === "°R")!;
  assert.ok(Math.abs(convertBetweenOptions(temperature, 491.67, rankineOption, kelvin) - 273.15) < 1e-9);
  assert.throws(() => convertBetweenOptions(temperature, -1, rankineOption, kelvin), RangeError);
});

test("export and import round-trip through a strict versioned schema", () => {
  const units: CustomUnit[] = [
    createCustomUnit(baseInput),
    createCustomUnit({ ...baseInput, name: "Smoot per hour", symbol: "smoot/h", dimension: "speed", scale: 1.7018 }),
  ];
  const text = serializeCustomUnits(units);
  const imported = parseCustomUnitsDocument(text);
  assert.equal(imported.ok, true);
  assert.equal(imported.units.length, 2);

  assert.equal(parseCustomUnitsDocument("not json").ok, false);
  assert.equal(parseCustomUnitsDocument(JSON.stringify({ version: 2, exportedAt: "x", units: [] })).ok, false);

  const withExtras = JSON.stringify({
    version: 1,
    exportedAt: "x",
    units: [
      { ...createCustomUnit(baseInput), arbitrary: "field" },
    ],
  });
  assert.equal(parseCustomUnitsDocument(withExtras).ok, false);
});

test("import rejects duplicates and unsupported dimensions while keeping valid rows", () => {
  const unit = createCustomUnit(baseInput);
  const duplicate = { ...unit, id: "cu_other" };
  const unsupported = createCustomUnit({ ...baseInput, name: "Bad fuel", symbol: "bf", dimension: "fuel" });
  const doc = JSON.stringify({
    version: 1,
    exportedAt: "x",
    units: [unit, duplicate, unsupported],
  });
  const result = parseCustomUnitsDocument(doc);
  assert.equal(result.ok, false);
  assert.equal(result.units.length, 1);
  assert.ok(result.errors.some((error) => error.toLowerCase().includes("duplicate")));
  assert.ok(result.errors.some((error) => error.toLowerCase().includes("unsupported")));
});

test("updating a unit preserves identity and refreshes the timestamp", () => {
  const unit = createCustomUnit(baseInput);
  const updated = updateCustomUnit(unit, { ...baseInput, name: "Smoot (revised)" });
  assert.equal(updated.id, unit.id);
  assert.equal(updated.createdAt, unit.createdAt);
  assert.equal(updated.name, "Smoot (revised)");
});

test("customUnitModel produces affine models only when an offset exists", () => {
  const linear = customUnitModel(createCustomUnit(baseInput));
  assert.equal(linear.kind, "linear");
  const affine = customUnitModel(
    createCustomUnit({ ...baseInput, dimension: "temperature", symbol: "°Ré", scale: 1.25, offset: 273.15 }),
  );
  assert.equal(affine.kind, "affine");
});
