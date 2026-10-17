import assert from "node:assert/strict";
import test from "node:test";
import {
  ExpressionError,
  evaluateExpression,
  looksLikeExpression,
  tryEvaluateExpression,
} from "./expression.ts";

function close(actual: number, expected: number, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("basic arithmetic respects operator precedence and associativity", () => {
  close(evaluateExpression("12 * 3.5"), 42);
  close(evaluateExpression("2 + 3 * 4"), 14);
  close(evaluateExpression("(2 + 3) * 4"), 20);
  close(evaluateExpression("2 ^ 3 ^ 2"), 512);
  close(evaluateExpression("17 % 5"), 2);
  close(evaluateExpression("-3 + 1"), -2);
  close(evaluateExpression("10 / 4"), 2.5);
});

test("functions and constants evaluate correctly", () => {
  close(evaluateExpression("sqrt(144)"), 12);
  close(evaluateExpression("cbrt(27)"), 3);
  close(evaluateExpression("abs(-4.5)"), 4.5);
  close(evaluateExpression("min(3, 1, 2)"), 1);
  close(evaluateExpression("max(3, 1, 2)"), 3);
  close(evaluateExpression("hypot(3, 4)"), 5);
  close(evaluateExpression("pow(2, 10)"), 1024);
  close(evaluateExpression("log10(1000)"), 3);
  close(evaluateExpression("sin(pi / 2)"), 1);
  close(evaluateExpression("round(2.5)"), 3);
});

test("scientific notation and uppercase exponents are supported", () => {
  close(evaluateExpression("1e3"), 1000);
  close(evaluateExpression("2.5E-2"), 0.025);
  close(evaluateExpression("1e-3 + 2e-3"), 0.003);
});

test("invalid expressions raise descriptive errors instead of executing", () => {
  assert.throws(() => evaluateExpression(""), ExpressionError);
  assert.throws(() => evaluateExpression("2 +"), ExpressionError);
  assert.throws(() => evaluateExpression("2 * (3 + 4"), ExpressionError);
  assert.throws(() => evaluateExpression("sqrt(-1)"), ExpressionError);
  assert.throws(() => evaluateExpression("1 / 0"), ExpressionError);
  assert.throws(() => evaluateExpression("alert(1)"), ExpressionError);
  assert.throws(() => evaluateExpression("process.exit(1)"), ExpressionError);
  assert.throws(() => evaluateExpression("[].constructor"), ExpressionError);
  assert.throws(() => evaluateExpression("1 +* 2"), ExpressionError);
});

test("tryEvaluateExpression reports failures without throwing", () => {
  const ok = tryEvaluateExpression("sqrt(144)");
  assert.equal(ok.ok, true);
  assert.equal(ok.value, 12);

  const bad = tryEvaluateExpression("sqrt(");
  assert.equal(bad.ok, false);
  assert.ok(bad.error && bad.error.length > 0);
  assert.ok(Number.isNaN(bad.value));
});

test("looksLikeExpression distinguishes plain numbers from formulas", () => {
  assert.equal(looksLikeExpression("42"), false);
  assert.equal(looksLikeExpression("-3.5"), false);
  assert.equal(looksLikeExpression("12 * 3.5"), true);
  assert.equal(looksLikeExpression("sqrt(9)"), true);
});
