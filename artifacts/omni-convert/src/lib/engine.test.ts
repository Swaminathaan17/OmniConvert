import assert from "node:assert/strict";
import test from "node:test";
import {
  ConversionError,
  affineUnit,
  convertInDimension,
  fromBase,
  linearUnit,
  nearlyEqual,
  toBase,
} from "./engine.ts";
import {
  categories,
  convert,
  dimensionDefinition,
  getUnit,
  unitModel,
} from "./units.ts";

/** Deterministic PRNG so property-style tests are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function category(id: string) {
  const found = categories.find((item) => item.id === id);
  assert.ok(found, `Expected category ${id}`);
  return found;
}

test("toBase and fromBase are inverse operations", () => {
  const linear = linearUnit(2.5);
  assert.equal(toBase(4, linear), 10);
  assert.equal(fromBase(10, linear), 4);

  const affine = affineUnit(5 / 9, 255.3722222222222);
  assert.ok(nearlyEqual(fromBase(toBase(32, affine), affine), 32, 1e-9));
});

test("affine Kelvin model converts temperature exactly and enforces absolute zero", () => {
  const temperature = category("temperature");
  const celsius = getUnit(temperature, "°C")!;
  const fahrenheit = getUnit(temperature, "°F")!;
  const kelvin = getUnit(temperature, "K")!;

  assert.ok(nearlyEqual(convert(temperature, 100, celsius, kelvin), 373.15, 1e-9));
  assert.ok(nearlyEqual(convert(temperature, 32, fahrenheit, celsius), 0, 1e-12));
  assert.ok(nearlyEqual(convert(temperature, -459.67, fahrenheit, kelvin), 0, 1e-9));
  assert.throws(() => convert(temperature, -274, celsius, fahrenheit), RangeError);
  assert.throws(() => convert(temperature, -0.001, kelvin, celsius), RangeError);
});

test("equivalent conversion paths produce the same result", () => {
  const rng = mulberry32(42);
  for (const item of categories) {
    if (item.id === "fuel" || item.temperature) continue;
    const units = item.units;
    for (let i = 0; i < 40; i += 1) {
      const a = units[Math.floor(rng() * units.length)]!;
      const b = units[Math.floor(rng() * units.length)]!;
      const c = units[Math.floor(rng() * units.length)]!;
      const value = (rng() * 2 - 1) * Math.pow(10, rng() * 8 - 4);
      const direct = convert(item, value, a, b);
      const viaC = convert(item, convert(item, value, a, c), c, b);
      assert.ok(
        nearlyEqual(direct, viaC, 1e-6),
        `${item.id}: ${a.symbol}->${b.symbol} via ${c.symbol} (${direct} vs ${viaC})`,
      );
    }
  }
});

test("random valid round-trip conversions stay within tolerance", () => {
  const rng = mulberry32(7);
  for (const item of categories) {
    if (item.id === "fuel") continue;
    const celsius = item.temperature ? getUnit(item, "°C")! : null;
    for (let i = 0; i < 60; i += 1) {
      const from = item.units[Math.floor(rng() * item.units.length)]!;
      const to = item.units[Math.floor(rng() * item.units.length)]!;
      const value = item.temperature
        ? convert(item, rng() * 600 - 200, celsius!, from)
        : (rng() * 2 - 1) * Math.pow(10, Math.floor(rng() * 9) - 3);
      const forward = convert(item, value, from, to);
      const back = convert(item, forward, to, from);
      assert.ok(
        nearlyEqual(back, value, 1e-6 * Math.max(1, Math.abs(value)) + 1e-9),
        `${item.id}: ${value} ${from.symbol} -> ${to.symbol} -> ${back}`,
      );
    }
  }
});

test("zero converts to zero for every linear dimension and negative values scale symmetrically", () => {
  for (const item of categories) {
    if (item.temperature || item.id === "fuel") continue;
    const from = item.units[0]!;
    const to = item.units[item.units.length - 1]!;
    assert.ok(nearlyEqual(convert(item, 0, from, to), 0, 1e-12));
    const positive = convert(item, 5, from, to);
    const negative = convert(item, -5, from, to);
    assert.ok(nearlyEqual(positive, -negative, 1e-9));
  }
});

test("extreme magnitudes either convert finitely or raise a clear error", () => {
  const length = category("length");
  const meter = getUnit(length, "m")!;
  const millimeter = getUnit(length, "mm")!;
  const tiny = convert(length, 1e-300, meter, millimeter);
  assert.ok(Number.isFinite(tiny) && tiny > 0);

  const huge = convert(length, 1e308, millimeter, meter);
  assert.ok(Number.isFinite(huge) && huge > 0);

  // Overflowing to a non-finite result is refused unless explicitly allowed.
  assert.throws(
    () => convertInDimension(dimensionDefinition(length), 1e308, linearUnit(1), linearUnit(1e-320)),
    ConversionError,
  );
  const allowed = convertInDimension(
    dimensionDefinition(length),
    1e308,
    linearUnit(1),
    linearUnit(1e-320),
    { allowNonFiniteResult: true },
  );
  assert.equal(allowed, Number.POSITIVE_INFINITY);
});

test("every built-in unit exposes a consistent model relative to its dimension base", () => {
  for (const item of categories) {
    const definition = dimensionDefinition(item);
    for (const unit of item.units) {
      const model = unitModel(item, unit);
      const value = item.temperature ? 20 : 3;
      const base = toBase(value, model);
      assert.ok(Number.isFinite(base), `${item.id}:${unit.symbol}`);
      assert.ok(nearlyEqual(fromBase(base, model), value, 1e-9));
    }
    assert.equal(definition.id, item.temperature ? "temperature" : item.dimension);
  }
});
