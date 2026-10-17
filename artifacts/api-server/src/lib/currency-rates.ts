export const SUPPORTED_CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "AED",
  "SAR",
  "SGD",
  "AUD",
  "CAD",
  "CHF",
  "HKD",
  "KRW",
  "BDT",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export type CurrencyRates = {
  baseCode: SupportedCurrency;
  rates: Record<string, number>;
  updatedAt: Date;
  fetchedAt: Date;
  provider: string;
  stale: boolean;
};

type ProviderRates = Omit<CurrencyRates, "stale">;

export interface CurrencyRateProvider {
  getLatest(base: SupportedCurrency): Promise<ProviderRates>;
}

type CacheEntry = {
  data: ProviderRates;
  expiresAt: number;
};

type OpenErPayload = {
  result?: unknown;
  base_code?: unknown;
  time_last_update_utc?: unknown;
  rates?: unknown;
};

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_CACHE_MAX_ENTRIES = 25;
const PROVIDER_TIMEOUT_MS = 8_000;
const PROVIDER_NAME = "ExchangeRate-API Open Access";

export interface CurrencyRatesOptions {
  /** How long a successful response stays fresh. */
  ttlMs?: number;
  /** Maximum number of base currencies cached at once. */
  maxEntries?: number;
  /** Injectable clock, primarily for tests. */
  now?: () => number;
}

/** Insertion-ordered cache. `Map` preserves order, giving FIFO eviction. */
const cache = new Map<SupportedCurrency, CacheEntry>();
/** In-flight requests, so simultaneous callers share one upstream fetch. */
const inFlight = new Map<SupportedCurrency, Promise<ProviderRates>>();

function writeCache(base: SupportedCurrency, entry: CacheEntry, maxEntries: number): void {
  cache.delete(base);
  cache.set(base, entry);
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Clear cached and in-flight state. Used by tests and diagnostics. */
export function clearCurrencyRateCache(): void {
  cache.clear();
  inFlight.clear();
}

export const openErApiProvider: CurrencyRateProvider = {
  async getLatest(base) {
    const response = await fetch(
      `https://open.er-api.com/v6/latest/${base}`,
      { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) },
    );

    if (!response.ok) {
      throw new Error(`Exchange-rate provider returned HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!isOpenErPayload(payload)) {
      throw new Error("Exchange-rate provider returned an invalid response");
    }
    if (payload.result !== "success" || payload.base_code !== base) {
      throw new Error("Exchange-rate provider could not serve the selected base currency");
    }
    if (typeof payload.time_last_update_utc !== "string" || !isRateMap(payload.rates)) {
      throw new Error("Exchange-rate provider returned incomplete rate data");
    }

    const updatedAt = new Date(payload.time_last_update_utc);
    if (!Number.isFinite(updatedAt.getTime())) {
      throw new Error("Exchange-rate provider returned an invalid update time");
    }

    const rates: Record<string, number> = { [base]: 1 };
    for (const currency of SUPPORTED_CURRENCIES) {
      const value = payload.rates[currency];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        rates[currency] = value;
      }
    }

    return {
      baseCode: base,
      rates,
      updatedAt,
      fetchedAt: new Date(),
      provider: PROVIDER_NAME,
    };
  },
};

function isOpenErPayload(value: unknown): value is OpenErPayload {
  return typeof value === "object" && value !== null;
}

function isRateMap(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (rate) => typeof rate === "number" && Number.isFinite(rate) && rate > 0,
  );
}

export class CurrencyRatesUnavailableError extends Error {
  constructor() {
    super("Live exchange rates are temporarily unavailable. Please try again shortly.");
    this.name = "CurrencyRatesUnavailableError";
  }
}

/**
 * Return exchange rates for `base`.
 *
 * - Fresh cache entries are returned immediately.
 * - `refresh` bypasses a fresh entry but still coalesces with an in-flight
 *   request so the provider is never hit redundantly.
 * - When the provider fails, any cached data (even expired) is returned marked
 *   `stale`. Only when there is no cache at all does this raise
 *   `CurrencyRatesUnavailableError`, and rates are never fabricated.
 */
export async function getCurrencyRates(
  base: SupportedCurrency,
  forceRefresh = false,
  provider: CurrencyRateProvider = openErApiProvider,
  options: CurrencyRatesOptions = {},
): Promise<CurrencyRates> {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
  const cached = cache.get(base);

  if (!forceRefresh && cached && cached.expiresAt > now()) {
    return { ...cached.data, stale: false };
  }

  // Coalesce simultaneous callers onto a single upstream request.
  const pending = inFlight.get(base);
  if (pending) {
    try {
      return { ...(await pending), stale: false };
    } catch {
      if (cached) return { ...cached.data, stale: true };
      throw new CurrencyRatesUnavailableError();
    }
  }

  const request = (async () => {
    const data = await provider.getLatest(base);
    writeCache(base, { data, expiresAt: now() + ttlMs }, maxEntries);
    return data;
  })();
  inFlight.set(base, request);

  try {
    return { ...(await request), stale: false };
  } catch {
    if (cached) {
      return { ...cached.data, stale: true };
    }
    throw new CurrencyRatesUnavailableError();
  } finally {
    inFlight.delete(base);
  }
}
