# 0005 — Batches run locally; exports neutralise spreadsheet formulas

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The batch lab lets users paste or upload a CSV and convert a column of values.
Two risks shape the design. First, sending arbitrary user data to a server is an
unnecessary privacy cost when the conversion is pure arithmetic. Second, a CSV
export is frequently opened in a spreadsheet, where a cell beginning with `=`,
`+`, `-`, `@`, tab, or carriage return can be interpreted as a formula — the
classic CSV/formula-injection problem.

## Decision

- **Everything runs on the client.** Uploaded files are read with the browser's
  `File.text()`; data never leaves the device. There is no batch endpoint.
- **Bounded work.** `CSV_LIMITS` caps input at 2 MB, 5,000 rows, and 64 columns.
  The parser flags truncation and over-wide rows instead of failing silently.
- **RFC 4180 parser.** `src/lib/csv.ts` handles quoted fields, escaped quotes,
  embedded delimiters and newlines, and CRLF, so real-world spreadsheets parse
  correctly.
- **Formula protection on export.** `serializeCsv` neutralises formula-leading
  cells by prefixing a single quote, while `isFormulaCell` recognises genuine
  signed numbers (`-3.5`, `+2e10`) so ordinary negative values are preserved.
  Rows that failed validation keep their original text and an explanatory
  message rather than being dropped.
- **Two artifacts.** A converted CSV for downstream use and a JSON report with
  the provider-independent metadata, counts, warnings, and per-row failures.

## Consequences

- Batch data stays private and the feature works offline.
- Exports are safe to open in Excel, Sheets, and Numbers by default; callers can
  opt out of protection, but the UI never does.
- The 2 MB / 5,000-row caps keep the synchronous parse and render responsive on
  low-end devices. Larger inputs should be split by the user.
