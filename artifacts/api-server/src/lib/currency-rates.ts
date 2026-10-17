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

const CACHE_TTL_MS = 60 * 60 * 1000;
const PROVIDER_NAME = "ExchangeRate-API Open Access";
const cache = new Map<SupportedCurrency, CacheEntry>();

const openErApiProvider: CurrencyRateProvider = {
  async getLatest(base) {
    const response = await fetch(
      `https://open.er-api.com/v6/latest/${base}`,
      { signal: AbortSignal.timeout(8_000) },
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

export async function getCurrencyRates(
  base: SupportedCurrency,
  forceRefresh = false,
  provider: CurrencyRateProvider = openErApiProvider,
): Promise<CurrencyRates> {
  const cached = cache.get(base);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, stale: false };
  }

  try {
    const data = await provider.getLatest(base);
    cache.set(base, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return { ...data, stale: false };
  } catch (error) {
    if (cached) {
      return { ...cached.data, stale: true };
    }
    throw new CurrencyRatesUnavailableError();
  }
}
