/**
 * Custom unit definitions.
 *
 * A custom unit is defined directly against the canonical base of its
 * dimension using a scale and (for temperature only) an offset:
 *
 *   base = value * scale + offset
 *
 * Because definitions reference the canonical base rather than other units,
 * circular definitions are impossible by construction. Offsets are restricted
 * to the temperature dimension, where an affine relationship is meaningful;
 * every other dimension must be purely multiplicative. Formulas are never
 * evaluated as strings.
 */

import { z } from "zod";
import { affineUnit, linearUnit, type UnitModel } from "./engine.ts";
import {
  categories,
  categoryById,
  convert,
  convertModels,
  getUnit,
  unitModel,
  type Category,
} from "./units.ts";
import { readVersioned, writeVersioned, type KeyValueStore } from "./storage.ts";

export const CUSTOM_UNITS_VERSION = 1;
export const CUSTOM_UNITS_KEY = "omni-custom-units";
export const CUSTOM_UNITS_MAX = 200;

export interface CustomUnit {
  id: string;
  name: string;
  symbol: string;
  dimension: string;
  scale: number;
  offset: number;
  precision: number;
  createdAt: number;
  updatedAt: number;
}

export interface CustomUnitInput {
  name: string;
  symbol: string;
  dimension: string;
  scale: number;
  offset: number;
  precision: number;
}

const customUnitSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(48),
    symbol: z.string().min(1).max(16),
    dimension: z.string().min(1).max(32),
    scale: z.number().finite().positive(),
    offset: z.number().finite(),
    precision: z.number().int().min(0).max(12),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

const exportSchema = z
  .object({
    version: z.number().int().positive(),
    exportedAt: z.string().min(1),
    units: z.array(customUnitSchema).max(CUSTOM_UNITS_MAX),
  })
  .strict();

/** Dimensions that support custom units (fuel economy is inverse, not affine). */
export function customUnitDimensions(): Category[] {
  return categories.filter((category) => category.id !== "fuel");
}

export function isCustomizableDimension(id: string): boolean {
  return id !== "fuel" && categories.some((category) => category.id === id);
}

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  value?: CustomUnitInput;
}

/** Validate and normalise a custom-unit definition. */
export function validateCustomUnitInput(
  input: CustomUnitInput,
  options: {
    existing?: readonly CustomUnit[];
    ignoreId?: string;
  } = {},
): ValidationResult {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  const symbol = input.symbol.trim();
  const existing = options.existing ?? [];

  if (name.length < 1) errors.name = "Enter a unit name.";
  else if (name.length > 48) errors.name = "Keep the name under 48 characters.";

  if (symbol.length < 1) errors.symbol = "Enter a unit symbol.";
  else if (symbol.length > 16) errors.symbol = "Keep the symbol under 16 characters.";
  else if (symbol !== symbol.replace(/[\u0000-\u001f]/g, "")) errors.symbol = "The symbol contains control characters.";

  const category = categoryById(input.dimension);
  if (!category) {
    errors.dimension = "Choose a supported dimension.";
  } else if (input.dimension === "fuel") {
    errors.dimension = "Fuel economy cannot be modelled with a custom unit because it is an inverse relationship.";
  }

  if (!Number.isFinite(input.scale) || input.scale <= 0) {
    errors.scale = "The scale must be a finite number greater than zero.";
  }
  if (!Number.isFinite(input.offset)) {
    errors.offset = "The offset must be a finite number.";
  } else if (input.offset !== 0 && input.dimension !== "temperature") {
    errors.offset = "An offset is only meaningful for temperature units.";
  }
  if (!Number.isInteger(input.precision) || input.precision < 0 || input.precision > 12) {
    errors.precision = "Precision must be a whole number between 0 and 12.";
  }

  if (category && symbol.length > 0) {
    const clashBuiltin = category.units.some(
      (unit) => unit.symbol.toLowerCase() === symbol.toLowerCase(),
    );
    if (clashBuiltin) {
      errors.symbol = `"${symbol}" is already a built-in ${category.name.toLowerCase()} unit.`;
    }
    const clashCustom = existing.some(
      (unit) =>
        unit.id !== options.ignoreId &&
        unit.dimension === input.dimension &&
        unit.symbol.toLowerCase() === symbol.toLowerCase(),
    );
    if (clashCustom) errors.symbol = `You already defined "${symbol}" in this dimension.`;
  }

  if (category && name.length > 0) {
    const clashName = [
      ...category.units.map((unit) => unit.name),
      ...existing
        .filter((unit) => unit.id !== options.ignoreId && unit.dimension === input.dimension)
        .map((unit) => unit.name),
    ].some((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (clashName) errors.name = `A unit named "${name}" already exists in this dimension.`;
  }

  const ok = Object.keys(errors).length === 0;
  return ok
    ? {
        ok,
        errors,
        value: {
          name,
          symbol,
          dimension: input.dimension,
          scale: input.scale,
          offset: input.dimension === "temperature" ? input.offset : 0,
          precision: input.precision,
        },
      }
    : { ok, errors };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `cu_${crypto.randomUUID()}`;
  }
  return `cu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createCustomUnit(input: CustomUnitInput): CustomUnit {
  const now = Date.now();
  return {
    id: newId(),
    name: input.name,
    symbol: input.symbol,
    dimension: input.dimension,
    scale: input.scale,
    offset: input.offset,
    precision: input.precision,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateCustomUnit(existing: CustomUnit, input: CustomUnitInput): CustomUnit {
  return { ...existing, ...input, updatedAt: Date.now() };
}

const customUnitsStoreSchema = z.array(customUnitSchema).max(CUSTOM_UNITS_MAX);

export function loadCustomUnits(storage: Pick<KeyValueStore, "getItem">): CustomUnit[] {
  const units = readVersioned<CustomUnit[]>(storage, CUSTOM_UNITS_KEY, {
    version: CUSTOM_UNITS_VERSION,
    fallback: [],
    validate: (value): value is CustomUnit[] => customUnitsStoreSchema.safeParse(value).success,
  });
  // Drop definitions for dimensions that no longer exist or are unsupported.
  return units.filter((unit) => isCustomizableDimension(unit.dimension));
}

export function saveCustomUnits(
  storage: Pick<KeyValueStore, "setItem">,
  units: readonly CustomUnit[],
): boolean {
  return writeVersioned(storage, CUSTOM_UNITS_KEY, CUSTOM_UNITS_VERSION, units);
}

export interface CustomUnitsSerialization {
  version: number;
  exportedAt: string;
  units: CustomUnit[];
}

export function serializeCustomUnits(units: readonly CustomUnit[]): string {
  const payload: CustomUnitsSerialization = {
    version: CUSTOM_UNITS_VERSION,
    exportedAt: new Date().toISOString(),
    units: [...units],
  };
  return JSON.stringify(payload, null, 2);
}

export interface CustomUnitsImportResult {
  ok: boolean;
  units: CustomUnit[];
  errors: string[];
  warnings: string[];
}

/** Parse and validate an exported custom-unit document. Never executes input. */
export function parseCustomUnitsDocument(text: string): CustomUnitsImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, units: [], errors: ["The file is not valid JSON."], warnings };
  }

  const parsed = exportSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      units: [],
      errors: [`The file does not match the expected format${first ? ` (${first.path.join(".") || "root"}: ${first.message})` : ""}.`],
      warnings,
    };
  }

  if (parsed.data.version !== CUSTOM_UNITS_VERSION) {
    if (parsed.data.version > CUSTOM_UNITS_VERSION) {
      return {
        ok: false,
        units: [],
        errors: [`This file was created by a newer version (schema ${parsed.data.version}).`],
        warnings,
      };
    }
    warnings.push(`Upgraded definitions from schema version ${parsed.data.version}.`);
  }

  const seenIds = new Set<string>();
  const seenSymbols = new Set<string>();
  const accepted: CustomUnit[] = [];

  for (const unit of parsed.data.units) {
    if (!isCustomizableDimension(unit.dimension)) {
      errors.push(`"${unit.name}" targets an unsupported dimension (${unit.dimension}).`);
      continue;
    }
    if (seenIds.has(unit.id)) {
      errors.push(`Duplicate identifier "${unit.id}" was ignored.`);
      continue;
    }
    const symbolKey = `${unit.dimension}:${unit.symbol.toLowerCase()}`;
    if (seenSymbols.has(symbolKey)) {
      errors.push(`Duplicate symbol "${unit.symbol}" in ${unit.dimension} was ignored.`);
      continue;
    }
    seenIds.add(unit.id);
    seenSymbols.add(symbolKey);
    accepted.push(unit);
  }

  return { ok: errors.length === 0, units: accepted, errors, warnings };
}

export function customUnitModel(unit: CustomUnit): UnitModel {
  return unit.offset !== 0 ? affineUnit(unit.scale, unit.offset) : linearUnit(unit.scale);
}

export interface UnitOption {
  id: string;
  name: string;
  symbol: string;
  categoryId: string;
  source: "builtin" | "custom";
  model: UnitModel;
  precision?: number;
}

/** Combined selectable units (built-in plus custom) for a category. */
export function unitOptionsFor(
  category: Category,
  customUnits: readonly CustomUnit[],
): UnitOption[] {
  const builtins: UnitOption[] = category.units.map((unit) => ({
    id: `builtin:${unit.symbol}`,
    name: unit.name,
    symbol: unit.symbol,
    categoryId: category.id,
    source: "builtin",
    model: unitModel(category, unit),
  }));
  const customs: UnitOption[] = customUnits
    .filter((unit) => unit.dimension === category.id)
    .map((unit) => ({
      id: unit.id,
      name: unit.name,
      symbol: unit.symbol,
      categoryId: category.id,
      source: "custom",
      model: customUnitModel(unit),
      precision: unit.precision,
    }));
  return [...builtins, ...customs];
}

/**
 * Convert between two options in the same category. Fuel economy keeps its
 * special inverse handling; every other dimension converts through the shared
 * engine so custom and built-in units behave identically.
 */
export function convertBetweenOptions(
  category: Category,
  value: number,
  from: UnitOption,
  to: UnitOption,
  options: { allowNonFiniteResult?: boolean } = {},
): number {
  if (category.id === "fuel") {
    const fromUnit = getUnit(category, from.symbol);
    const toUnit = getUnit(category, to.symbol);
    if (!fromUnit || !toUnit) throw new RangeError("Unknown fuel-economy unit.");
    return convert(category, value, fromUnit, toUnit);
  }
  return convertModels(category, value, from.model, to.model, options);
}
