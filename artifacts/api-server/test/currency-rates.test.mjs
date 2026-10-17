import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  CurrencyRatesUnavailableError,
  SUPPORTED_CURRENCIES,
  clearCurrencyRateCache,
  getCurrencyRates,
  isSupportedCurrency,
  openErApiProvider,
} from "../src/lib/currency-rates.ts";

const FIXED_NOW = Date.parse("2026-10-17T00:00:00.000Z");

const makeProvider = (rates, updatedAt = new Date("2026-10-17T00:00:00.000Z"), hooks = {}) => ({
  calls: 0,
  async getLatest(baseCode) {
    this.calls += 1;
    if (hooks.delayMs) await new Promise((resolve) => setTimeout(resolve, hooks.delayMs));
    return {
      baseCode,
      rates: { [baseCode]: 1, ...rates },
      updatedAt,
      fetchedAt: new Date(FIXED_NOW),
      provider: "Test provider",
    };
  },
});

function unavailableProvider(message = "Provider unavailable") {
  return {
    async getLatest() {
      throw new Error(message);
    },
  };
}

beforeEach(() => {
  clearCurrencyRateCache();
});

test("an unconfigured or unreachable provider fails explicitly without fabricated rates", async () => {
  await assert.rejects(
    getCurrencyRates("CNY", true, unavailableProvider("Provider configuration is missing")),
    CurrencyRatesUnavailableError,
  );
});

test("a provider failure returns cached data marked stale, never as fresh", async () => {
  const fresh = await getCurrencyRates("BDT", true, makeProvider({ INR: 0.7, USD: 0.0082 }));
  assert.equal(fresh.stale, false);
  assert.equal(fresh.rates.USD, 0.0082);

  const stale = await getCurrencyRates("BDT", true, unavailableProvider());
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt.toISOString(), fresh.updatedAt.toISOString());
});

test("a fresh cache entry avoids a second provider call, and refresh bypasses it", async () => {
  const provider = makeProvider({ USD: 1, EUR: 0.9 });
  const first = await getCurrencyRates("USD", false, provider, { now: () => FIXED_NOW });
  assert.equal(first.stale, false);
  assert.equal(provider.calls, 1);

  const cached = await getCurrencyRates("USD", false, provider, { now: () => FIXED_NOW });
  assert.equal(cached.stale, false);
  assert.equal(provider.calls, 1);

  await getCurrencyRates("USD", true, provider, { now: () => FIXED_NOW });
  assert.equal(provider.calls, 2);
});

test("expired cache entries trigger a refresh but still back a forced failure", async () => {
  const provider = makeProvider({ USD: 1, EUR: 0.9 });
  let clock = FIXED_NOW;
  await getCurrencyRates("EUR", false, provider, { now: () => clock, ttlMs: 1000 });
  assert.equal(provider.calls, 1);

  clock += 5000; // entry is now expired
  const stale = await getCurrencyRates("EUR", false, unavailableProvider(), { now: () => clock, ttlMs: 1000 });
  assert.equal(stale.stale, true);

  const refreshed = await getCurrencyRates("EUR", false, provider, { now: () => clock, ttlMs: 1000 });
  assert.equal(refreshed.stale, false);
  assert.equal(provider.calls, 2);
});

test("concurrent requests for the same base coalesce into one provider call", async () => {
  const provider = makeProvider({ USD: 1, EUR: 0.9 }, undefined, { delayMs: 25 });
  const results = await Promise.all([
    getCurrencyRates("GBP", true, provider),
    getCurrencyRates("GBP", true, provider),
    getCurrencyRates("GBP", true, provider),
  ]);
  assert.equal(provider.calls, 1);
  for (const result of results) {
    assert.equal(result.rates.USD, 1);
    assert.equal(result.stale, false);
  }
});

test("the cache is bounded and evicts the oldest base currency", async () => {
  const provider = makeProvider({ USD: 1 });
  const bases = SUPPORTED_CURRENCIES.slice(0, 4);
  for (const base of bases) {
    await getCurrencyRates(base, true, provider, { maxEntries: 2, now: () => FIXED_NOW });
  }
  // The two oldest were evicted; requesting one again must hit the provider.
  const before = provider.calls;
  await getCurrencyRates(bases[0], false, provider, { maxEntries: 2, now: () => FIXED_NOW });
  assert.equal(provider.calls, before + 1);
});

test("timeouts and malformed provider responses are treated as failures", async () => {
  const timeoutProvider = {
    async getLatest() {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    },
  };
  await assert.rejects(getCurrencyRates("AUD", true, timeoutProvider), CurrencyRatesUnavailableError);

  const malformedProvider = {
    async getLatest() {
      throw new Error("Exchange-rate provider returned incomplete rate data");
    },
  };
  await assert.rejects(getCurrencyRates("CAD", true, malformedProvider), CurrencyRatesUnavailableError);
});

test("unsupported base currencies are rejected by the guard", () => {
  assert.equal(isSupportedCurrency("USD"), true);
  assert.equal(isSupportedCurrency("XYZ"), false);
  assert.equal(isSupportedCurrency(null), false);
  assert.equal(isSupportedCurrency(42), false);
});

test("the real provider validates success, status, base, and rate shapes", async () => {
  const originalFetch = globalThis.fetch;
  const respond = (body, init = {}) => {
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } });
  };

  try {
    respond({ result: "success", base_code: "USD", time_last_update_utc: "Sat, 17 Oct 2026 00:00:00 +0000", rates: { USD: 1, EUR: 0.9 } });
    const ok = await openErApiProvider.getLatest("USD");
    assert.equal(ok.rates.EUR, 0.9);
    assert.equal(ok.baseCode, "USD");

    respond({ error: "nope" }, { status: 503 });
    await assert.rejects(openErApiProvider.getLatest("USD"), /HTTP 503/);

    respond({ result: "error", base_code: "USD", rates: {} });
    await assert.rejects(openErApiProvider.getLatest("USD"), /could not serve/);

    respond({ result: "success", base_code: "EUR", time_last_update_utc: "not a date", rates: { USD: 1 } });
    await assert.rejects(openErApiProvider.getLatest("EUR"), /incomplete rate data|invalid update time/);

    respond({ result: "success", base_code: "USD", time_last_update_utc: "Sat, 17 Oct 2026 00:00:00 +0000", rates: { USD: "1" } });
    await assert.rejects(openErApiProvider.getLatest("USD"), /incomplete rate data/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
