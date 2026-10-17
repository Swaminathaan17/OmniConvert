# OmniConvert

OmniConvert is a browser-based unit conversion workspace built with React, TypeScript, and Vite. It covers everyday and technical measurements, currency reference rates, CSV batch conversions, custom units, and saved conversion collections.

The main conversion engine runs locally in the browser. Currency conversions request reference rates from the API; uploaded files and batch data are processed on the device.

## Features

- **Unit conversion:** 22 measurement categories, configurable precision and rounding, expression input, favorites, recent conversions, and shareable conversion links.
- **Currency:** 15 supported currencies, live reference rates, cache freshness indicators, and explicit error states when rates cannot be retrieved.
- **Batch conversion:** import or paste CSV data, map columns, convert rows locally, review invalid rows, and export CSV or JSON results.
- **Custom units:** create, validate, import, and export user-defined units.
- **Collections:** save groups of useful conversions and share them using links.
- **Offline support:** installable app shell and service-worker caching for the frontend. API responses are not cached by the service worker.

## Repository layout

- `artifacts/omni-convert` — React/Vite frontend and conversion engine.
- `artifacts/api-server` — Express API, including the currency-rate endpoint.
- `lib/db`, `lib/api-zod`, `lib/api-client-react` — shared database, validation, and API-client packages.
- `docs/adr` — short architecture decision records.
- `scripts` — project maintenance and benchmark scripts.

## Requirements

- Node.js 24 or a compatible current Node.js release.
- pnpm.
- A network connection for installing dependencies and retrieving currency rates. Core unit conversions do not need a network connection after the app has loaded.

## Install and run

Install workspace dependencies from the repository root:

```sh
pnpm install
```

The frontend Vite configuration expects `PORT` and `BASE_PATH`. On macOS/Linux:

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/omni-convert run dev
```

In PowerShell:

```powershell
$env:PORT = "5173"
$env:BASE_PATH = "/"
pnpm --filter @workspace/omni-convert run dev
```

The API server can be started separately with:

```sh
pnpm --filter @workspace/api-server run dev
```

Check `.env.example` and the API server configuration for environment variables needed by your local setup.

## Checks

Run the repository type checks and production builds:

```sh
pnpm run typecheck
pnpm run build
```

Run the focused tests:

```sh
pnpm run test:app
pnpm run test:api
```

A benchmark script is available through:

```sh
pnpm --filter @workspace/omni-convert run benchmark
```

## Currency-rate behaviour

The API reads reference rates from ExchangeRate-API Open Access. Successful responses are cached in memory for a limited period, concurrent requests for the same base currency share an in-flight request, and upstream calls have a timeout. If the provider is unavailable, cached rates may be returned with a stale indicator. When no cached rates are available, the API reports an error rather than inventing values.

Reference rates are not guaranteed to match a bank, card network, or money-transfer provider's final rate or fees. Historical currency charts are not provided.

## Conversion assumptions

- Temperature conversion uses absolute Celsius, Fahrenheit, and Kelvin scales and rejects values below absolute zero.
- Calendar months are treated as 30 days and years as 365.25 days.
- SI data sizes use powers of 1,000; IEC data sizes use powers of 1,024.
- US customary and imperial volume units are represented separately.
- Fuel-economy conversion handles inverse relationships explicitly.

## Performance approach

The app favours local calculations and bounded work over adding features that make common conversions slower. Batch imports have explicit size limits, and currency caching avoids unnecessary upstream requests.
