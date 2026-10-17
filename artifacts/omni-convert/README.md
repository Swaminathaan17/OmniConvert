# OmniConvert Studio

OmniConvert Studio is a precision conversion workspace. It converts across 22
measurement categories, compares live reference rates for 15 currencies, runs
whole-table CSV conversions, supports user-defined custom units, and lets you
save and share reusable conversion collections. Core tools run entirely on the
device and work offline; only currency rates touch the network.

Everything is stored locally in the browser. There is no account, database, or
server-side user data.

## Features

- **Unit converter** — 22 categories, two-way editable inputs, an optional safe
  expression evaluator (`12 * 3.5`, `sqrt(144)`, `2^10`), configurable rounding
  modes, significant-figures and scientific/engineering/compact notation,
  favorites, recent history, and shareable links.
- **Currency** — live provider reference rates, freshness/staleness labelling,
  and honest error states (never a fabricated rate).
- **Batch lab** — paste or upload a CSV, choose the value and label columns,
  convert every row, review row-level errors, filter/sort/search, then export a
  converted CSV or a JSON report. Input is capped at 2 MB / 5,000 rows / 64
  columns and processed on the device.
- **Custom units** — define units for any multiplicative dimension, plus affine
  temperature scales, with Zod-validated import/export.
- **Collections** — curated presets and your own named sets of conversions,
  with share links that carry conversion settings only.
- **Offline & installable** — a service worker precaches the app shell; the
  manifest makes it installable. The API is deliberately never cached.

## Run

This app is part of the Replit pnpm workspace. Start it from the project
workflows so the web app receives its preview path and the shared API receives
the `/api` route:

- Web app: `pnpm --filter @workspace/omni-convert run dev`
- API server: `pnpm --filter @workspace/api-server run dev`

`.env.example` documents that the exchange-rate source needs no key. The
workspace workflows provide the ports and routing.

## Currency rates

The server uses the ExchangeRate-API Open Access endpoint
`https://open.er-api.com/v6/latest/{base}`. The browser calls only the
server-side `GET /api/currency/rates?base=...` endpoint. Responses are cached in
memory for one hour with a bounded FIFO cache, concurrent requests for the same
base are coalesced, and provider calls time out after eight seconds. A manual
refresh bypasses a fresh cache; if the provider fails, cached data is served
**flagged as stale**. When there is no usable cache, the API returns an error
and the app never substitutes estimated or demo rates.

The provider's reference rates may be updated on its own schedule. Banks, card
networks, and transfer services may apply different rates or fees. This provider
offers no historical series, so OmniConvert does not show a historical chart.

The currency list is INR, USD, EUR, GBP, JPY, CNY, AED, SAR, SGD, AUD, CAD, CHF,
HKD, KRW, and BDT. If the upstream feed does not return a requested pair, the
app reports that pair as unavailable.

## Unit assumptions

- Temperature uses absolute Celsius, Fahrenheit, and Kelvin scales, anchored to
  Kelvin so values below absolute zero are rejected. Temperature differences are
  not offset-converted.
- A calendar month is 30 days; a year is 365.25 days.
- SI data sizes use powers of 1,000 (KB, MB, GB, TB); IEC sizes use powers of
  1,024 (KiB, MiB, GiB, TiB).
- US and imperial volume units are explicitly distinguished. Calories use the
  thermochemical calorie and BTU uses the international-table definition.
- Fuel economy correctly handles the inverse relationship between
  distance-per-volume and litres-per-100-kilometres.

## Architecture

- `src/lib/engine.ts` — the affine conversion core (`toBase`/`fromBase`,
  `convertInDimension`, absolute-zero enforcement, near-equality).
- `src/lib/units.ts` — the typed unit registry plus `dimensionDefinition`,
  `unitModel`, and `convertModels`; its `convert` delegates to the engine.
- `src/lib/expression.ts` — a safe recursive-descent expression evaluator with
  no `eval` and a fixed function/constant whitelist.
- `src/lib/number-format.ts` — parsing and explicit-rounding formatting.
- `src/lib/csv.ts` — RFC 4180 parsing/serialisation with formula protection and
  documented `CSV_LIMITS`.
- `src/lib/custom-units.ts` — Zod-validated custom-unit CRUD and import/export.
- `src/lib/collections.ts` — presets, user collections, and URL-safe share
  encoding.
- `src/lib/storage.ts` — resilient, versioned `localStorage` helpers.
- `src/App.tsx` — the unit and currency pages, routing, and shared state.
- `src/pages/` — the lazy-loaded `batch`, `custom-units`, and `collections`
  pages; `src/components/layout.tsx` is the app shell.
- `public/sw.js` + `public/manifest.webmanifest` — offline shell and install
  metadata.
- `../api-server/src/lib/currency-rates.ts` — the replaceable provider adapter
  and bounded cache; `../api-server/src/routes/currency.ts` validates and serves
  the route.
- `../../lib/api-spec/openapi.yaml` — source of truth for the generated currency
  client and schemas.

The `convert` package remains listed as a dependency for now but is no longer
imported; removing it is a follow-up (see ADR 0001). Non-obvious decisions are
recorded in [`docs/adr/`](../../docs/adr/).

## Tests, typecheck, and benchmark

```sh
pnpm --filter @workspace/omni-convert run test        # unit tests (node:test)
pnpm --filter @workspace/omni-convert run typecheck
pnpm --filter @workspace/omni-convert run benchmark    # micro-benchmarks
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run typecheck
pnpm run typecheck                                     # whole workspace
```

The app tests cover category completeness, standard conversions, temperature
limits, fuel-economy inverses, SI/IEC data conversions, invalid values,
incompatible dimensions, round trips, number parsing/rounding/formatting, the
expression evaluator, CSV parsing and formula protection, custom-unit
validation and import/export, collections and share tokens, and
favorites/history persistence. The API tests cover provider failures, stale
cache fallback, cache expiry and refresh, request coalescing, bounded eviction,
timeouts and malformed responses, and base-currency validation.

## Publish

Use the Replit project's Publish action. Include both the web artifact and the
shared API service so the currency page can reach `/api/currency/rates`. The
service worker registers automatically in production builds.
