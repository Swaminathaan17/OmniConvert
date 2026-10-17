/**
 * RFC 4180-style CSV parsing and serialisation.
 *
 * The parser handles quoted fields, escaped quotes (`""`), embedded
 * delimiters, embedded newlines (LF or CRLF), and a trailing newline. Export
 * applies spreadsheet formula-injection protection so a value such as
 * `=1+1` or `@SUM(A1)` cannot execute when the file is opened in a
 * spreadsheet program, while genuine negative numbers such as `-3.5` are
 * preserved.
 */

export interface CsvParseOptions {
  delimiter?: string;
  /** Maximum number of data rows to keep. Extra rows are dropped and flagged. */
  maxRows?: number;
}

export interface CsvParseResult {
  rows: string[][];
  /** True when at least one row was dropped due to `maxRows`. */
  truncated: boolean;
  /** Non-fatal issues discovered while parsing. */
  warnings: string[];
}

export const CSV_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxRows: 5_000,
  maxColumns: 64,
} as const;

function assertDelimiter(delimiter: string): void {
  if (delimiter.length !== 1) {
    throw new RangeError("CSV delimiter must be exactly one character.");
  }
  if (delimiter === '"' || delimiter === "\n" || delimiter === "\r") {
    throw new RangeError("This character cannot be used as a CSV delimiter.");
  }
}

/** Detect the most likely delimiter from a sample of the text. */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4096);
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  for (const candidate of candidates) {
    const parsed = parseCsv(sample, { delimiter: candidate, maxRows: 20 });
    const firstRow = parsed.rows[0]?.length ?? 0;
    const width = parsed.rows.reduce((max, row) => Math.max(max, row.length), 0);
    const score = width > 1 ? firstRow * 100 + width : 0;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

export function parseCsv(text: string, options: CsvParseOptions = {}): CsvParseResult {
  const delimiter = options.delimiter ?? ",";
  assertDelimiter(delimiter);
  const maxRows = options.maxRows ?? CSV_LIMITS.maxRows;

  const rows: string[][] = [];
  const warnings: string[] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let truncated = false;
  let index = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Skip completely empty trailing rows.
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    if (rows.length >= maxRows) {
      truncated = true;
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      if (field.length > 0) {
        // A quote appearing mid-field is treated literally for resilience.
        field += char;
        index += 1;
        continue;
      }
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      pushField();
      index += 1;
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      pushRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  if (inQuotes) {
    warnings.push("A quoted value was not closed; the remaining text was read as one field.");
  }
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  if (truncated) {
    warnings.push(`Only the first ${maxRows.toLocaleString()} rows were read.`);
  }
  const widest = rows.reduce((max, current) => Math.max(max, current.length), 0);
  if (widest > CSV_LIMITS.maxColumns) {
    warnings.push(`Rows contain more than ${CSV_LIMITS.maxColumns} columns.`);
  }

  return { rows, truncated, warnings };
}

const SAFE_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/** True when a raw cell would be interpreted as a formula by a spreadsheet. */
export function isFormulaCell(value: string): boolean {
  if (value.length === 0) return false;
  const first = value[0]!;
  if (first === "=" || first === "@" || first === "\t" || first === "\r") return true;
  if (first === "+" || first === "-") {
    // A leading sign is only safe when the whole cell is a plain number.
    return !SAFE_NUMBER.test(value);
  }
  return false;
}

/** Neutralise a cell that would otherwise be treated as a formula. */
export function sanitizeCsvCell(value: string): string {
  return isFormulaCell(value) ? `'${value}` : value;
}

const NEEDS_QUOTING = /[",\n\r]/;

function quoteCell(value: string, delimiter: string): string {
  const needsQuotes = NEEDS_QUOTING.test(value) || value.includes(delimiter);
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export interface CsvSerializeOptions {
  delimiter?: string;
  /** Apply spreadsheet formula-injection protection (default: true). */
  protectFormulas?: boolean;
  newline?: "\n" | "\r\n";
}

export function serializeCsv(
  rows: readonly (readonly (string | number | null | undefined)[])[],
  options: CsvSerializeOptions = {},
): string {
  const delimiter = options.delimiter ?? ",";
  assertDelimiter(delimiter);
  const protect = options.protectFormulas ?? true;
  const newline = options.newline ?? "\r\n";

  return rows
    .map((row) =>
      row
        .map((cell) => {
          const raw = cell === null || cell === undefined ? "" : String(cell);
          const safe = protect ? sanitizeCsvCell(raw) : raw;
          return quoteCell(safe, delimiter);
        })
        .join(delimiter),
    )
    .join(newline);
}

/** Trigger a browser download of text content. Safe no-op outside the DOM. */
export function downloadTextFile(filename: string, content: string, mimeType = "text/csv;charset=utf-8"): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
