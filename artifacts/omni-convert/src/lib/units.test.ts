import assert from "node:assert/strict";
import test from "node:test";
import { categories, convert, getUnit } from "./units.ts";

function category(id: string) {
  const result = categories.find((item) => item.id === id);
  assert.ok(result, `Expected category ${id}`);
  return result;
}

function value(id: string, amount: number, from: string, to: string) {
  const selected = category(id);
  const source = getUnit(selected, from);
  const destination = getUnit(selected, to);
  assert.ok(source, `Expected source unit ${from}`);
  assert.ok(destination, `Expected destination unit ${to}`);
  return convert(selected, amount, source, destination);
}

function close(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("the registry contains all 22 requested measurement categories", () => {
  const expected: Record<string, string[]> = {
    length: ["mm", "cm", "m", "km", "µm", "nm", "in", "ft", "yd", "mi", "nmi"],
    mass: ["µg", "mg", "g", "kg", "t", "oz", "lb", "st"],
    temperature: ["°C", "°F", "K"],
    area: ["mm²", "cm²", "m²", "ha", "km²", "in²", "ft²", "ac", "mi²"],
    volume: ["mL", "L", "cm³", "m³", "tsp US", "tbsp US", "fl oz US", "cup US", "gal US", "gal imp", "ft³"],
    speed: ["m/s", "km/h", "mph", "ft/s", "kn"],
    time: ["ms", "s", "min", "h", "d", "wk", "mo", "yr"],
    pressure: ["Pa", "kPa", "MPa", "bar", "atm", "psi", "mmHg"],
    energy: ["J", "kJ", "cal", "kcal", "Wh", "kWh", "eV", "BTU"],
    power: ["W", "kW", "MW", "hp"],
    force: ["N", "kN", "lbf"],
    frequency: ["Hz", "kHz", "MHz", "GHz"],
    data: ["bit", "B", "KB", "MB", "GB", "TB", "KiB", "MiB", "GiB", "TiB"],
    "data-rate": ["bit/s", "kbit/s", "Mbit/s", "Gbit/s", "B/s", "MB/s"],
    angle: ["°", "rad", "gon", "′", "″"],
    density: ["kg/m³", "g/cm³", "g/mL", "lb/ft³"],
    torque: ["N·m", "lb·ft", "lb·in"],
    fuel: ["km/L", "L/100 km", "mpg US", "mpg imp"],
    current: ["A", "mA", "µA"],
    voltage: ["V", "mV", "kV"],
    resistance: ["Ω", "kΩ", "MΩ"],
    illuminance: ["lx", "fc"],
  };
  assert.equal(categories.length, 22);
  assert.deepEqual(new Set(categories.map((item) => item.id)), new Set(Object.keys(expected)));
  for (const [id, symbols] of Object.entries(expected)) {
    assert.deepEqual(category(id).units.map((item) => item.symbol), symbols);
  }
});

test("standard length, mass, area, and volume conversions", () => {
  close(value("length", 1, "km", "m"), 1000);
  close(value("mass", 1, "kg", "g"), 1000);
  close(value("area", 1, "ac", "m²"), 4046.8564224, 1e-7);
  close(value("volume", 1, "gal US", "L"), 3.785411784, 1e-9);
  close(value("volume", 1, "cup US", "mL"), 236.5882365, 1e-9);
});

test("every registered unit converts through the shared engine", () => {
  for (const item of categories) {
    const reference = item.units[0];
    for (const unit of item.units) {
      const toReference = convert(item, 1, unit, reference);
      const roundTrip = convert(item, toReference, reference, unit);
      assert.ok(Number.isFinite(toReference), `${item.id}: ${unit.symbol} to ${reference.symbol}`);
      assert.ok(Number.isFinite(roundTrip), `${item.id}: ${reference.symbol} to ${unit.symbol}`);
      close(roundTrip, 1, 1e-9);
    }
  }
});

test("temperature offsets and the absolute-zero boundary", () => {
  close(value("temperature", 32, "°F", "°C"), 0);
  close(value("temperature", 0, "°C", "K"), 273.15);
  close(value("temperature", -459.67, "°F", "K"), 0, 1e-10);
  const kelvin = category("temperature");
  const celsius = getUnit(kelvin, "°C");
  const fahrenheit = getUnit(kelvin, "°F");
  assert.ok(celsius && fahrenheit);
  assert.throws(() => convert(kelvin, -274, celsius, fahrenheit), RangeError);
  assert.throws(() => convert(kelvin, -1, getUnit(kelvin, "K")!, celsius), RangeError);
});

test("fuel economy conversions use inverse relationships in both directions", () => {
  const litersPer100 = value("fuel", 25, "mpg US", "L/100 km");
  close(litersPer100, 9.408, 0.002);
  close(value("fuel", litersPer100, "L/100 km", "mpg US"), 25, 1e-10);
  assert.ok(Number.isNaN(value("fuel", 0, "km/L", "L/100 km")));
});

test("decimal and binary data units remain distinct", () => {
  close(value("data", 1, "KB", "B"), 1000);
  close(value("data", 1, "KiB", "B"), 1024);
  close(value("data-rate", 1, "Mbit/s", "MB/s"), 0.125);
  close(value("data-rate", 1, "MB/s", "Mbit/s"), 8);
});

test("calendar duration assumptions use 30-day months and 365.25-day years", () => {
  close(value("time", 1, "mo", "d"), 30);
  close(value("time", 1, "yr", "d"), 365.25);
});

test("zero, negative, and very small finite values convert without crashing", () => {
  close(value("length", 0, "m", "ft"), 0);
  close(value("length", -3, "ft", "m"), -0.9144, 1e-12);
  const tiny = value("length", 1e-300, "m", "mm");
  assert.ok(Number.isFinite(tiny) && tiny > 0);
});

test("non-finite values and incompatible categories are rejected", () => {
  const length = category("length");
  const meter = getUnit(length, "m");
  const foot = getUnit(length, "ft");
  const kilogram = getUnit(category("mass"), "kg");
  assert.ok(meter && foot && kilogram);
  assert.throws(() => convert(length, Number.NaN, meter, foot), RangeError);
  assert.throws(() => convert(length, Number.POSITIVE_INFINITY, meter, foot), RangeError);
  assert.throws(() => convert(length, 1, meter, kilogram), RangeError);
});

test("conversion round trips preserve representative values", () => {
  close(value("length", value("length", 7.25, "mi", "km"), "km", "mi"), 7.25, 1e-12);
  close(value("temperature", value("temperature", 22, "°C", "°F"), "°F", "°C"), 22, 1e-12);
  close(value("data", value("data", 1.75, "GiB", "MB"), "MB", "GiB"), 1.75, 1e-12);
});
