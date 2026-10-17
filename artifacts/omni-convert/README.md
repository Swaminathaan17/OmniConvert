# OmniConvert

OmniConvert converts common measurements across 22 categories and provides live reference-rate conversions for 15 currencies. Favorites, recent conversions, theme, precision, and converter preferences are stored locally in the browser; there is no account or database requirement.

## Run

This app is part of the Replit pnpm workspace. Start it from the project workflows so the web app receives its preview path and the shared API receives the `/api` route:

- Web app: `pnpm --filter @workspace/omni-convert run dev`
- API server: `pnpm --filter @workspace/api-server run dev`

The `.env.example` file documents that the selected exchange-rate source does not require a key. No currency API secrets need to be configured. The workspace workflows provide the ports and routing.

## Currency rates

The server uses the ExchangeRate-API Open Access endpoint at `https://open.er-api.com/v6/latest/{base}`. The browser calls only the server-side `GET /api/currency/rates?base=...` endpoint. Responses are cached in memory for one hour. A manual refresh bypasses a fresh cache; if the provider is down, cached data is marked stale. When there is no usable cache, the API returns an error and the app does not substitute estimated or demo rates.

The displayed provider update time is the upstream timestamp. The provider's reference rates may be updated on its own schedule; banks, card networks, and transfer services may apply different rates or fees. Historical data is not offered by this provider, so OmniConvert does not show a historical chart.

The initial currency list is INR, USD, EUR, GBP, JPY, CNY, AED, SAR, SGD, AUD, CAD, CHF, HKD, KRW, and BDT. If the upstream feed does not return a requested pair, the app reports that rate as unavailable.

## Unit assumptions

- Temperature conversions use absolute Celsius, Fahrenheit, and Kelvin scales. They reject values below absolute zero. Temperature differences are not offset-converted.
- Calendar month is treated as 30 days; year is 365.25 days.
- SI data sizes use powers of 1,000 (KB, MB, GB, TB); IEC sizes use powers of 1,024 (KiB, MiB, GiB, TiB).
- US and imperial volume units are explicitly distinguished. Calories use the thermochemical calorie, and BTU uses the international-table definition.
- Fuel economy conversions correctly handle inverse relationships between distance-per-volume and liters-per-100-kilometers.

## Architecture

- `src/lib/units.ts` is the typed unit registry and conversion engine. It uses the actively maintained `convert` package for compatible supported linear units and precise registry-based formulas for units/categories the package does not cover, with custom logic for absolute temperature and inverse fuel economy.
- `src/App.tsx` contains the responsive converter and currency interfaces, navigation, and local preference persistence.
- `../api-server/src/lib/currency-rates.ts` is the replaceable currency provider adapter and cache.
- `../api-server/src/routes/currency.ts` validates and serves the currency API route.
- `../../lib/api-spec/openapi.yaml` is the source of truth for the generated currency client and schemas.

## Tests and checks

```sh
pnpm --filter @workspace/omni-convert run test
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/omni-convert run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm run typecheck
```

The unit tests cover category completeness, common conversions, temperature limits, fuel-economy inverses, SI/IEC data conversions, invalid values, incompatible dimensions, round trips, favorites/history persistence, provider errors, and stale-cache behavior.

## Publish

Use the Replit project's Publish action. The web artifact and the shared API service need to be included so the currency page can reach `/api/currency/rates`.
