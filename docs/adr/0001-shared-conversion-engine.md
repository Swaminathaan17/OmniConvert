# 0001 — One shared affine conversion engine

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The original converter routed compatible linear units through the third-party
`convert` package and handled everything else (temperature, fuel economy, a few
categories the package did not cover) with bespoke branches. That meant two
code paths for the same job, subtly different rounding, and no single place to
enforce invariants such as "never convert across incompatible dimensions" or
"temperature must not go below absolute zero". Adding user-defined units on top
of that split would have multiplied the special cases.

## Decision

Introduce `src/lib/engine.ts` as the single conversion core. Every unit is
described by a small **unit model** with an affine relationship to the
dimension's canonical base:

```
base = value * scale + offset      // toBase
value = (base - offset) / scale    // fromBase
```

A `DimensionDefinition` carries the base's minimum value and a comparison
tolerance, so absolute-zero enforcement and near-equality live in one place.
`convertInDimension` converts `from → base → to`, raising a `ConversionError`
(a `RangeError`) with a descriptive message when a value is out of range or the
result is not finite.

`src/lib/units.ts` exposes `unitModel`, `dimensionDefinition`, and
`convertModels`, and its public `convert` now delegates to the engine. Fuel
economy remains a documented exception because it is an inverse relationship,
not an affine one.

## Consequences

- One code path for built-in and custom units; rounding and range rules are
  consistent everywhere.
- The `convert` package is no longer used by `units.ts`. It is still listed as
  a dependency (the lockfile is frozen), but should be removed in a follow-up.
- Fuel economy needs special handling at the call site. This is centralised in
  `convertBetweenOptions` so the UI does not branch on it.
- The engine is pure and dependency-free, so it is easy to test exhaustively
  (round trips, magnitude extremes, every registered unit).
