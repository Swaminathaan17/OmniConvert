# 0003 — Currency rates: bounded cache with explicit staleness

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Currency conversion is the only feature that needs the network. The provider
(ExchangeRate-API Open Access) is free, keyless, rate-limited, and occasionally
slow or unavailable. The original implementation cached one entry forever and
had no protection against a burst of concurrent requests, so a spike could
trigger a burst of upstream calls. It also risked presenting stale values as if
they were fresh.

## Decision

`artifacts/api-server/src/lib/currency-rates.ts` implements a small, explicit
policy:

- **Request coalescing.** Concurrent requests for the same base share one
  in-flight provider promise.
- **Bounded FIFO cache.** At most 25 base currencies are kept; the oldest is
  evicted when the limit is exceeded.
- **Injectable time and settings.** `ttlMs`, `maxEntries`, and `now` are
  injectable so behaviour is deterministic under test.
- **Hard timeout.** Provider calls use `AbortSignal.timeout(8000)`.
- **Explicit staleness.** On a provider failure the last cached value may be
  served, but it is always flagged `stale: true` and never presented as fresh.
  If there is no usable cache entry, the endpoint fails with a
  `CurrencyRatesUnavailableError` — no estimated, demo, or hard-coded rates are
  ever substituted.
- **Strict validation.** The payload, success flag, base code, and every rate
  are validated before anything is cached.

The API schema is unchanged, so the generated client and Zod schemas did not
need to be regenerated.

## Consequences

- A flaky provider degrades to a clearly-labelled cached rate or an honest
  error, never to a fabricated number.
- The UI must render the `stale` badge and the "no placeholder rates"
  disclosure, which it does.
- Cache state is process-local. Multiple server instances would each hold their
  own cache; acceptable for the current single-instance deployment, and the
  layer is easy to swap if that changes.
