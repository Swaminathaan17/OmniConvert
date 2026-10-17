/**
 * Numeric parsing and formatting helpers.
 *
 * Rounding behaviour is explicit and testable: callers choose a rounding mode
 * rather than relying on `toFixed`, whose behaviour is platform-defined for
 * ties. Parsing is locale-aware and never uses `eval`. All functions are pure.
 */

export type RoundingMode = "half-up" | "half-even" | "half-down" | "ceil" | "floor" | "trunc";

export const ROUNDING_MODES: readonly RoundingMode[] = [
  "half-up",
  "half-even",
  "half-down",
  "ceil",
  "floor",
  "trunc",
];

export const ROUNDING_MODE_LABELS: Readonly<Record<RoundingMode, string>> = {
  "half-up": "Half up (0.5 → 1)",
  "half-even": "Half to even (banker's)",
  "half-down": "Half down (0.5 → 0)",
  ceil: "Round up (ceiling)",
  floor: "Round down (floor)",
  trunc: "Toward zero (truncate)",
};

/** Shift a decimal number by a power of ten using its own string form. */
function shift(value: number, exponent: number): number {
  const [mantissa, existing] = value.toString().split("e");
  const base = Number(mantissa);
  const power = (existing ? Number(existing) : 0) + exponent;
  return Number(`${base}e${power}`);
}

function roundShifted(value: number, mode: RoundingMode): number {
  switch (mode) {
    case "ceil":
      return Math.ceil(value);
    case "floor":
      return Math.floor(value);
    case "trunc":
      return Math.trunc(value);
    case "half-up":
      return value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5);
    case "half-down":
      return value < 0 ? -Math.ceil(-value - 0.5) : Math.ceil(value - 0.5);
    case "half-even": {
      const lower = Math.floor(value);
      const diff = value - lower;
      if (diff > 0.5) return lower + 1;
      if (diff < 0.5) return lower;
      return lower % 2 === 0 ? lower : lower + 1;
    }
  }
}

/** Round to a fixed number of decimal places with an explicit tie-breaking mode. */
export function roundTo(value: number, digits: number, mode: RoundingMode = "half-up"): number {
  if (!Number.isFinite(value)) return value;
  const places = Math.max(-308, Math.min(15, Math.trunc(digits)));
  if (value === 0) return 0;
  const shifted = shift(value, places);
  if (!Number.isFinite(shifted)) return value;
  return shift(roundShifted(shifted, mode), -places);
}

/** Round to a number of significant figures with an explicit mode. */
export function roundToSignificant(
  value: number,
  significantDigits: number,
  mode: RoundingMode = "half-up",
): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const digits = Math.max(1, Math.min(15, Math.trunc(significantDigits)));
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  return roundTo(value, digits - 1 - exponent, mode);
}

export type NumberNotation = "auto" | "decimal" | "scientific" | "engineering" | "compact";

export interface FormatOptions {
  locale?: string | string[];
  /** Fixed decimal places. */
  digits?: number;
  /** Significant figures; takes precedence over `digits` when set. */
  significantDigits?: number;
  notation?: NumberNotation;
  mode?: RoundingMode;
  group?: boolean;
  /** Remove trailing zeros in fixed-decimal output. */
  trimTrailingZeros?: boolean;
}

export const PLACEHOLDER = "—";

function resolveLocale(locale: FormatOptions["locale"]): string | string[] | undefined {
  if (locale === undefined) return undefined;
  if (Array.isArray(locale) && locale.length === 0) return undefined;
  return locale;
}

/**
 * Format a finite number. Non-finite values render as an em dash so the
 * interface never shows `Infinity` or `NaN`.
 */
export function formatNumber(value: number, options: FormatOptions = {}): string {
  if (!Number.isFinite(value)) return PLACEHOLDER;
  const locale = resolveLocale(options.locale);
  const mode = options.mode ?? "half-up";
  const notation = options.notation ?? "auto";
  const group = options.group ?? true;

  if (options.significantDigits !== undefined && notation !== "scientific" && notation !== "engineering") {
    const rounded = roundToSignificant(value, options.significantDigits, mode);
    if (rounded !== 0 && (Math.abs(rounded) >= 1e15 || Math.abs(rounded) < 1e-6)) {
      return formatExponential(rounded, options.significantDigits, locale);
    }
    const exponent = rounded === 0 ? 0 : Math.floor(Math.log10(Math.abs(rounded)));
    const fractionDigits = Math.max(0, options.significantDigits - 1 - exponent);
    return formatFixed(rounded, fractionDigits, locale, group, options.trimTrailingZeros ?? false);
  }

  const digits = Math.max(0, Math.min(15, options.digits ?? 4));
  const rounded = roundTo(value, digits, mode);

  if (notation === "scientific" || notation === "engineering") {
    return formatExponential(
      rounded,
      options.significantDigits ?? Math.max(1, digits + 1),
      locale,
      notation === "engineering",
    );
  }

  if (notation === "compact") {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumSignificantDigits: Math.max(2, digits + 1) }).format(rounded);
  }

  if (notation === "auto" && rounded !== 0 && (Math.abs(rounded) >= 1e15 || (value !== 0 && rounded === 0))) {
    return formatExponential(value, Math.max(3, digits + 1), locale);
  }

  return formatFixed(rounded, digits, locale, group, options.trimTrailingZeros ?? false);
}

function formatFixed(
  value: number,
  digits: number,
  locale: FormatOptions["locale"],
  group: boolean,
  trimTrailingZeros: boolean,
): string {
  const safeLocale = resolveLocale(locale);
  return new Intl.NumberFormat(safeLocale, {
    useGrouping: group,
    minimumFractionDigits: trimTrailingZeros ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatExponential(
  value: number,
  significantDigits: number,
  locale: FormatOptions["locale"],
  engineering = false,
): string {
  const safeLocale = resolveLocale(locale);
  if (engineering) {
    return new Intl.NumberFormat(safeLocale, {
      notation: "engineering",
      maximumSignificantDigits: Math.max(1, significantDigits),
    }).format(value);
  }
  const exponent = value === 0 ? 0 : Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value === 0 ? 0 : value / Math.pow(10, exponent);
  const roundedMantissa = roundToSignificant(mantissa, significantDigits);
  const localeDecimal = decimalSeparator(safeLocale);
  const sign = exponent >= 0 ? "+" : "−";
  return `${String(roundedMantissa).replace(".", localeDecimal)} × 10^${sign}${Math.abs(exponent)}`;
}

function decimalSeparator(locale: FormatOptions["locale"]): string {
  try {
    const parts = new Intl.NumberFormat(resolveLocale(locale), { minimumFractionDigits: 1 }).formatToParts(1.1);
    return parts.find((part) => part.type === "decimal")?.value ?? ".";
  } catch {
    return ".";
  }
}

function groupSeparator(locale: FormatOptions["locale"]): string {
  try {
    const parts = new Intl.NumberFormat(resolveLocale(locale)).formatToParts(12345.6);
    return parts.find((part) => part.type === "group")?.value ?? ",";
  } catch {
    return ",";
  }
}

export interface ParseOptions {
  locale?: string | string[];
  /** Allow helper functions and operators (parsed separately by the caller). */
  allowBlank?: boolean;
}

export interface ParseResult {
  ok: boolean;
  value: number;
  error?: string;
}

/** Strip locale grouping and normalise the decimal separator. */
export function normalizeNumericText(input: string, locale?: string | string[]): string {
  let text = input.trim().replace(/\u2212/g, "-").replace(/[\s\u00a0\u202f]/g, "");
  const decimal = decimalSeparator(locale);
  const group = groupSeparator(locale);
  const hasDot = text.includes(".");
  const hasComma = text.includes(",");

  if (hasDot && hasComma) {
    // The right-most separator is the decimal point; the other is grouping.
    const decimalChar = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
    const groupChar = decimalChar === "." ? "," : ".";
    text = text.split(groupChar).join("");
    if (decimalChar === ",") text = text.replace(",", ".");
  } else if (hasComma || hasDot) {
    const char = hasComma ? "," : ".";
    if (char === decimal && decimal !== ".") {
      text = text.replace(",", ".");
    } else if (char === group && group !== decimal) {
      text = text.split(char).join("");
    } else if (char === "," && decimal === ",") {
      text = text.replace(",", ".");
    }
  }

  return text;
}

const NUMERIC_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/** Parse a user-entered number using the locale's separators. */
export function parseLocaleNumber(input: string, options: ParseOptions = {}): ParseResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return options.allowBlank
      ? { ok: true, value: Number.NaN }
      : { ok: false, value: Number.NaN, error: "Enter a value to convert." };
  }
  const normalized = normalizeNumericText(trimmed, options.locale);
  if (!NUMERIC_PATTERN.test(normalized)) {
    return { ok: false, value: Number.NaN, error: "This is not a valid number." };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { ok: false, value: Number.NaN, error: "This number is too large or too small to use." };
  }
  return { ok: true, value };
}

/** Describe the magnitude of a value for user-facing hints. */
export function describeMagnitude(value: number): string {
  if (!Number.isFinite(value)) return "not a finite number";
  const abs = Math.abs(value);
  if (abs === 0) return "zero";
  if (abs < 1e-9) return "extremely small";
  if (abs < 1e-3) return "very small";
  if (abs >= 1e15) return "extremely large";
  if (abs >= 1e9) return "very large";
  return "normal";
}
