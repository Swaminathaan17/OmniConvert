import assert from "node:assert/strict";
import test from "node:test";
import {
  CurrencyRatesUnavailableError,
  getCurrencyRates,
} from "../src/lib/currency-rates.ts";

const makeProvider = (rates, updatedAt = new Date("2026-10-17T00:00:00.000Z")) => ({
  async getLatest(baseCode) {
    return {
      baseCode,
      rates: { [baseCode]: 1, ...rates },
      updatedAt,
      fetchedAt: new Date("2026-10-17T00:05:00.000Z"),
      provider: "Test provider",
    };
  },
});

test("an unconfigured or unreachable provider fails explicitly without fabricated rates", async () => {
  const unavailableProvider = {
    async getLatest() {
      throw new Error("Provider configuration is missing");
    },
  };
  await assert.rejects(
    getCurrencyRates("CNY", true, unavailableProvider),
    CurrencyRatesUnavailableError,
  );
});

test("a provider failure returns cached data marked stale, never as fresh", async () => {
  const fresh = await getCurrencyRates(
    "BDT",
    true,
    makeProvider({ INR: 0.7, USD: 0.0082 }),
  );
  assert.equal(fresh.stale, false);
  assert.equal(fresh.rates.USD, 0.0082);

  const unavailableProvider = {
    async getLatest() {
      throw new Error("Provider unavailable");
    },
  };
  const stale = await getCurrencyRates("BDT", true, unavailableProvider);
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt.toISOString(), fresh.updatedAt.toISOString());
});
