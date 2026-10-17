import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNumber,
  normalizeNumericText,
  parseLocaleNumber,
  roundTo,
  roundToSignificant,
} from "./number-format.ts";

test("roundTo honours every rounding mode at the midpoint", () => {
  assert.equal(roundTo(2.5, 0, "half-up"), 3);
  assert.equal(roundTo(3.5, 0, "half-up"), 4);
  assert.equal(roundTo(-2.5, 0, "half-up"), -3);
  assert.equal(roundTo(-3.5, 0, "half-up"), -4);

  assert.equal(roundTo(2.5, 0, "half-even"), 2);
  assert.equal(roundTo(3.5, 0, "half-even"), 4);
  assert.equal(roundTo(-2.5, 0, "half-even"), -2);

  assert.equal(roundTo(2.5, 0, "half-down"), 2);
  assert.equal(roundTo(-2.5, 0, "half-down"), -2);

  assert.equal(roundTo(2.1, 0, "ceil"), 3);
  assert.equal(roundTo(-2.1, 0, "ceil"), -2);
  assert.equal(roundTo(2.9, 0, "floor"), 2);
  assert.equal(roundTo(2.9, 0, "trunc"), 2);
  assert.equal(roundTo(-2.9, 0, "trunc"), -2);
});

test("roundTo avoids classic binary floating-point midpoint errors", () => {
  assert.equal(roundTo(1.005, 2, "half-up"), 1.01);
  assert.equal(roundTo(2.675, 2, "half-up"), 2.68);
  assert.equal(roundTo(0.1 + 0.2, 5), 0.3);
});

test("roundToSignificant keeps the requested number of significant figures", () => {
  assert.equal(roundToSignificant(123456, 3), 123000);
  assert.equal(roundToSignificant(0.00123456, 3), 0.00123);
  assert.equal(roundToSignificant(9.99, 2, "half-up"), 10);
});

test("formatNumber supports fixed, significant, and scientific output", () => {
  assert.equal(formatNumber(1234.5678, { locale: "en-US", digits: 2 }), "1,234.57");
  assert.equal(formatNumber(1234.5678, { locale: "en-US", significantDigits: 3 }), "1,230");
  assert.equal(formatNumber(0.000012345, { locale: "en-US", significantDigits: 3 }), "0.0000123");
  assert.ok(formatNumber(1.23e20, { locale: "en-US", digits: 4 }).includes("10^"));
  assert.equal(formatNumber(Number.NaN, { digits: 2 }), "—");
  assert.equal(formatNumber(Number.POSITIVE_INFINITY, { digits: 2 }), "—");
});

test("parseLocaleNumber understands grouping and locale decimal separators", () => {
  assert.deepEqual(parseLocaleNumber("1,234.56", { locale: "en-US" }).value, 1234.56);
  assert.deepEqual(parseLocaleNumber("1.234,56", { locale: "de-DE" }).value, 1234.56);
  assert.deepEqual(parseLocaleNumber("1 234,56", { locale: "fr-FR" }).value, 1234.56);
  assert.deepEqual(parseLocaleNumber("-3.5e2", { locale: "en-US" }).value, -350);
  assert.equal(normalizeNumericText("1.234,56", "de-DE"), "1234.56");
});

test("parseLocaleNumber rejects malformed and non-finite input", () => {
  assert.equal(parseLocaleNumber("", { locale: "en-US" }).ok, false);
  assert.equal(parseLocaleNumber("abc", { locale: "en-US" }).ok, false);
  assert.equal(parseLocaleNumber("1.2.3", { locale: "en-US" }).ok, false);
  assert.equal(parseLocaleNumber("1e999", { locale: "en-US" }).ok, false);
  assert.equal(parseLocaleNumber("   ", { locale: "en-US" }).ok, false);
});
