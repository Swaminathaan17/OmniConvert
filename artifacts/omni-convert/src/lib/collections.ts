/**
 * Reusable conversion collections and shareable configuration links.
 *
 * A collection is a named list of conversion configurations (category, units,
 * optional amount and formatting). Built-in presets ship with the app; user
 * collections persist locally. Sharing encodes a configuration as a compact,
 * URL-safe token. Only conversion settings are shared — never history,
 * favorites, or any personal data.
 */

import { z } from "zod";
import { ROUNDING_MODES, type NumberNotation, type RoundingMode } from "./number-format.ts";
import { categories } from "./units.ts";
import { readVersioned, writeVersioned, type KeyValueStore } from "./storage.ts";

export const COLLECTIONS_VERSION = 1;
export const COLLECTIONS_KEY = "omni-collections";
export const COLLECTIONS_MAX = 100;
export const COLLECTION_ITEMS_MAX = 50;
export const SHARE_TOKEN_MAX = 4096;

const NOTATIONS: readonly NumberNotation[] = ["auto", "decimal", "scientific", "engineering", "compact"];

export interface ConversionConfig {
  category: string;
  from: string;
  to: string;
  amount?: string;
  precision?: number;
  rounding?: RoundingMode;
  notation?: NumberNotation;
}

export interface ConversionCollection {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  items: ConversionConfig[];
  createdAt: number;
  updatedAt: number;
}

const configSchema = z
  .object({
    category: z.string().min(1).max(32),
    from: z.string().min(1).max(24),
    to: z.string().min(1).max(24),
    amount: z.string().max(64).optional(),
    precision: z.number().int().min(0).max(15).optional(),
    rounding: z.enum(ROUNDING_MODES as unknown as [RoundingMode, ...RoundingMode[]]).optional(),
    notation: z.enum(NOTATIONS as unknown as [NumberNotation, ...NumberNotation[]]).optional(),
  })
  .strict();

const collectionSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(64),
    description: z.string().max(240),
    builtin: z.boolean(),
    items: z.array(configSchema).max(COLLECTION_ITEMS_MAX),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

const collectionsStoreSchema = z.array(collectionSchema).max(COLLECTIONS_MAX);

export function isKnownCategory(id: string): boolean {
  return id === "currency" || categories.some((category) => category.id === id);
}

function isUnitInCategory(categoryId: string, symbol: string): boolean {
  if (categoryId === "currency") return /^[A-Za-z]{3}$/.test(symbol);
  const category = categories.find((item) => item.id === categoryId);
  return category ? category.units.some((unit) => unit.symbol === symbol) : false;
}

export interface ConfigIssue {
  index: number;
  message: string;
}

/** Validate a configuration, optionally treating extra symbols as custom units. */
export function validateConversionConfig(
  config: ConversionConfig,
  customSymbols: Readonly<Record<string, readonly string[]>> = {},
): string[] {
  const issues: string[] = [];
  if (!isKnownCategory(config.category)) {
    issues.push(`Unknown category "${config.category}".`);
    return issues;
  }
  const extras = customSymbols[config.category] ?? [];
  const known = (symbol: string) => isUnitInCategory(config.category, symbol) || extras.includes(symbol);
  if (!known(config.from)) issues.push(`Unknown source unit "${config.from}".`);
  if (!known(config.to)) issues.push(`Unknown destination unit "${config.to}".`);
  return issues;
}

const BUILTIN_TIMESTAMP = 0;

function builtin(id: string, name: string, description: string, items: ConversionConfig[]): ConversionCollection {
  return { id, name, description, builtin: true, items, createdAt: BUILTIN_TIMESTAMP, updatedAt: BUILTIN_TIMESTAMP };
}

export const builtInCollections: readonly ConversionCollection[] = [
  builtin("preset:engineering", "Engineering", "Pressure, power, torque, and force pairs.", [
    { category: "pressure", from: "bar", to: "psi", precision: 3 },
    { category: "power", from: "kW", to: "hp", precision: 3 },
    { category: "torque", from: "N·m", to: "lb·ft", precision: 3 },
    { category: "force", from: "N", to: "lbf", precision: 4 },
    { category: "energy", from: "kWh", to: "BTU", precision: 1 },
  ]),
  builtin("preset:travel", "Travel", "Distance, speed, temperature, and money on the move.", [
    { category: "length", from: "km", to: "mi", precision: 2 },
    { category: "speed", from: "km/h", to: "mph", precision: 1 },
    { category: "temperature", from: "°C", to: "°F", precision: 1 },
    { category: "volume", from: "L", to: "gal US", precision: 3 },
    { category: "currency", from: "USD", to: "EUR", amount: "100" },
  ]),
  builtin("preset:cooking", "Cooking", "Kitchen measures without guesswork.", [
    { category: "volume", from: "tbsp US", to: "tsp US", precision: 1 },
    { category: "volume", from: "cup US", to: "mL", precision: 0 },
    { category: "mass", from: "oz", to: "g", precision: 1 },
    { category: "mass", from: "lb", to: "kg", precision: 3 },
  ]),
  builtin("preset:data", "Data & storage", "Decimal versus binary sizes and transfer rates.", [
    { category: "data", from: "GB", to: "GiB", precision: 4 },
    { category: "data", from: "MB", to: "MiB", precision: 3 },
    { category: "data-rate", from: "Mbit/s", to: "MB/s", precision: 3 },
  ]),
  builtin("preset:laboratory", "Laboratory", "Bench-scale length, mass, energy, and pressure.", [
    { category: "length", from: "µm", to: "nm", precision: 1 },
    { category: "mass", from: "g", to: "mg", precision: 1 },
    { category: "energy", from: "cal", to: "J", precision: 3 },
    { category: "pressure", from: "Pa", to: "mmHg", precision: 5 },
    { category: "temperature", from: "°C", to: "K", precision: 2 },
  ]),
];

export function loadCollections(storage: Pick<KeyValueStore, "getItem">): ConversionCollection[] {
  return readVersioned<ConversionCollection[]>(storage, COLLECTIONS_KEY, {
    version: COLLECTIONS_VERSION,
    fallback: [],
    validate: (value): value is ConversionCollection[] => collectionsStoreSchema.safeParse(value).success,
  });
}

export function saveCollections(
  storage: Pick<KeyValueStore, "setItem">,
  collections: readonly ConversionCollection[],
): boolean {
  return writeVersioned(storage, COLLECTIONS_KEY, COLLECTIONS_VERSION, collections);
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `col_${crypto.randomUUID()}`;
  return `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createCollection(
  name: string,
  description: string,
  items: ConversionConfig[],
): ConversionCollection {
  const now = Date.now();
  return {
    id: newId(),
    name: name.trim().slice(0, 64),
    description: description.trim().slice(0, 240),
    builtin: false,
    items: items.slice(0, COLLECTION_ITEMS_MAX),
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ *
 * Shareable URL-safe encoding
 * ------------------------------------------------------------------ */

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShareConfig(config: ConversionConfig): string {
  return toBase64Url(JSON.stringify(config));
}

export function decodeShareConfig(token: string): ConversionConfig | null {
  if (!token || token.length > SHARE_TOKEN_MAX) return null;
  try {
    const parsed = configSchema.safeParse(JSON.parse(fromBase64Url(token)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function encodeCollection(collection: ConversionCollection): string {
  const payload = {
    name: collection.name,
    description: collection.description,
    items: collection.items,
  };
  return toBase64Url(JSON.stringify(payload));
}

export interface SharedCollectionPayload {
  name: string;
  description: string;
  items: ConversionConfig[];
}

export function decodeCollection(token: string): SharedCollectionPayload | null {
  if (!token || token.length > SHARE_TOKEN_MAX) return null;
  try {
    const schema = z
      .object({
        name: z.string().min(1).max(64),
        description: z.string().max(240).default(""),
        items: z.array(configSchema).min(1).max(COLLECTION_ITEMS_MAX),
      })
      .strict();
    const parsed = schema.safeParse(JSON.parse(fromBase64Url(token)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
