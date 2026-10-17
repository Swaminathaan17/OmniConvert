/**
 * General unit-conversion engine.
 *
 * A unit is modelled as an affine mapping between a value expressed in that
 * unit and a canonical base value for the dimension:
 *
 *   base = value * scale + offset
 *   value = (base - offset) / scale
 *
 * Linear units use `offset = 0`. Affine units (for example Celsius relative to
 * the Kelvin base) use a non-zero offset. Every conversion is expressed as a
 * change of base, so any two units in the same dimension compose correctly and
 * round-trip conversions are exact up to floating-point error.
 *
 * This module is intentionally free of React, DOM, and storage concerns so the
 * mathematical core can be unit tested in isolation and reused by the UI, the
 * batch laboratory, and the custom-unit system.
 */

export interface LinearUnitModel {
  readonly kind: "linear";
  readonly scale: number;
}

export interface AffineUnitModel {
  readonly kind: "affine";
  readonly scale: number;
  readonly offset: number;
}

export type UnitModel = LinearUnitModel | AffineUnitModel;

export interface DimensionDefinition {
  /** Stable dimension id, e.g. "length" or "temperature". */
  readonly id: string;
  /** Human-readable base unit, used in explanations. */
  readonly base: string;
  /**
   * Lowest physically meaningful value in canonical base units. For
   * temperature this is absolute zero (0 K). Undefined for dimensions with no
   * natural lower bound.
   */
  readonly baseMinimum?: number;
  /** Absolute tolerance applied around `baseMinimum`. */
  readonly tolerance?: number;
}

export class ConversionError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "ConversionError";
  }
}

function assertFiniteScale(scale: number): void {
  if (!Number.isFinite(scale) || scale === 0) {
    throw new ConversionError("A unit scale must be a finite, non-zero number.");
  }
}

export function linearUnit(scale: number): LinearUnitModel {
  assertFiniteScale(scale);
  return { kind: "linear", scale };
}

export function affineUnit(scale: number, offset: number): AffineUnitModel {
  assertFiniteScale(scale);
  if (!Number.isFinite(offset)) {
    throw new ConversionError("A unit offset must be a finite number.");
  }
  return { kind: "affine", scale, offset };
}

export function isLinearUnit(model: UnitModel): model is LinearUnitModel {
  return model.kind === "linear";
}

export function unitOffset(model: UnitModel): number {
  return model.kind === "affine" ? model.offset : 0;
}

/** Convert a value expressed in `model` to the canonical base of its dimension. */
export function toBase(value: number, model: UnitModel): number {
  if (!Number.isFinite(value)) {
    throw new ConversionError("Conversion input must be a finite number.");
  }
  return model.kind === "linear" ? value * model.scale : value * model.scale + model.offset;
}

/** Convert a canonical base value back into `model`. */
export function fromBase(base: number, model: UnitModel): number {
  if (!Number.isFinite(base)) {
    throw new ConversionError("Conversion input must be a finite number.");
  }
  return model.kind === "linear" ? base / model.scale : (base - model.offset) / model.scale;
}

export interface ConvertOptions {
  /**
   * When true, a result that overflows to a non-finite number is returned as
   * Infinity instead of raising. Useful for batch mode where an overflow is a
   * per-row warning rather than a fatal error.
   */
  readonly allowNonFiniteResult?: boolean;
}

/**
 * Convert `value` from `from` to `to` within the given dimension, validating
 * finiteness, the dimension's physical lower bound, and (by default) that the
 * result is finite.
 */
export function convertInDimension(
  dimension: DimensionDefinition,
  value: number,
  from: UnitModel,
  to: UnitModel,
  options: ConvertOptions = {},
): number {
  if (!Number.isFinite(value)) {
    throw new ConversionError("Conversion input must be a finite number.");
  }

  const base = toBase(value, from);

  if (dimension.baseMinimum !== undefined) {
    const tolerance = dimension.tolerance ?? 1e-9;
    if (base < dimension.baseMinimum - tolerance) {
      throw new ConversionError(
        `Value is below the physical minimum for ${dimension.id}.`,
      );
    }
  }

  const result = fromBase(base, to);
  if (!options.allowNonFiniteResult && !Number.isFinite(result)) {
    throw new ConversionError(
      "The result is too large or too small to represent as a number.",
    );
  }
  return result;
}

/**
 * Floating-point comparison with an absolute and relative tolerance. Intended
 * for tests and for "are these effectively the same unit" checks, never as a
 * substitute for exact arithmetic where it matters.
 */
export function nearlyEqual(a: number, b: number, tolerance = 1e-9): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= tolerance) return true;
  return diff <= tolerance * Math.max(Math.abs(a), Math.abs(b));
}
