import assert from "node:assert/strict";
import test from "node:test";
import {
  CSV_LIMITS,
  detectDelimiter,
  isFormulaCell,
  parseCsv,
  sanitizeCsvCell,
  serializeCsv,
} from "./csv.ts";

test("parses simple rows and ignores a trailing newline", () => {
  const result = parseCsv("a,b,c\n1,2,3\n");
  assert.deepEqual(result.rows, [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
  assert.equal(result.truncated, false);
});

test("handles quoted fields, embedded delimiters, escaped quotes, and newlines", () => {
  const text = 'name,note\n"Doe, Jane","She said ""hi"""\n"multi\nline",plain\n';
  const result = parseCsv(text);
  assert.deepEqual(result.rows, [
    ["name", "note"],
    ["Doe, Jane", 'She said "hi"'],
    ["multi\nline", "plain"],
  ]);
});

test("handles CRLF line endings", () => {
  const result = parseCsv("a,b\r\n1,2\r\n");
  assert.deepEqual(result.rows, [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("detects the delimiter from a sample", () => {
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  assert.equal(detectDelimiter("a\tb\tc\n1\t2\t3"), "\t");
  assert.equal(detectDelimiter("a,b,c\n1,2,3"), ",");
});

test("enforces the row limit and reports truncation", () => {
  const lines = ["value"];
  for (let i = 0; i < 20; i += 1) lines.push(String(i));
  const result = parseCsv(lines.join("\n"), { maxRows: 5 });
  assert.equal(result.rows.length, 5);
  assert.equal(result.truncated, true);
  assert.ok(result.warnings.some((warning) => warning.includes("first 5")));
});

test("warns about unterminated quoted fields", () => {
  const result = parseCsv('a,b\n"open,2');
  assert.ok(result.warnings.some((warning) => warning.toLowerCase().includes("not closed")));
});

test("serialises with correct quoting and protects against formula injection", () => {
  const csv = serializeCsv([
    ["value", "note"],
    [3.5, "a, b"],
    ["=1+1", 'quote "here"'],
    ["@SUM(A1:A2)", "plain\nline"],
  ]);
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed.rows, [
    ["value", "note"],
    ["3.5", "a, b"],
    ["'=1+1", 'quote "here"'],
    ["'@SUM(A1:A2)", "plain\nline"],
  ]);
});

test("formula detection preserves genuine signed numbers", () => {
  assert.equal(isFormulaCell("=1+1"), true);
  assert.equal(isFormulaCell("+1+1"), true);
  assert.equal(isFormulaCell("-2+3"), true);
  assert.equal(isFormulaCell("@cmd"), true);
  assert.equal(isFormulaCell("-3.5"), false);
  assert.equal(isFormulaCell("+12"), false);
  assert.equal(isFormulaCell("1e-3"), false);
  assert.equal(sanitizeCsvCell("-3.5"), "-3.5");
  assert.equal(sanitizeCsvCell("=1+1"), "'=1+1");
});

test("exposes documented limits", () => {
  assert.equal(CSV_LIMITS.maxBytes, 2 * 1024 * 1024);
  assert.ok(CSV_LIMITS.maxRows > 0);
});
