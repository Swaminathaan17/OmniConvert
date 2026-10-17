# 0002 — Custom units reference the dimension base directly

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Users asked to define their own units (a house measurement, a company-specific
packaging size, a regional temperature scale). The obvious modelling choice —
define a custom unit in terms of another unit, the way a spreadsheet lets you —
invites circular definitions and makes conversion depend on the order in which
definitions are evaluated.

## Decision

A custom unit is defined **only** against its dimension's canonical base:

```
base = value * scale + offset
```

- Definitions never reference other units, so cycles are impossible by
  construction.
- An `offset` is only permitted for the temperature dimension, where an affine
  transform is physically meaningful. Every other dimension must be purely
  multiplicative (`offset` must be `0`).
- Fuel economy is excluded entirely, because it is an inverse relationship that
  an affine model cannot express.
- Symbols and names are validated against built-in units and against other
  custom units **in the same dimension** to avoid ambiguity in the pickers.
- Definitions are persisted under a versioned key (`omni-custom-units`, schema
  v1) and validated with Zod on both read and import. Imports are strictly
  parsed; nothing is ever evaluated as a string.
- The UI exposes a small curated set of numeric fields rather than a formula
  box, so there is no expression surface to abuse.

`convertBetweenOptions` treated custom and built-in units identically by feeding
both through the shared engine (see ADR 0001).

## Consequences

- No circular-definition handling is needed anywhere.
- Importing a definition file from a newer schema version is rejected with a
  clear message; older versions are accepted with a warning.
- Custom units are per-device and per-browser; there is no server component.
  Export/import is the sharing mechanism.
- Adding a new *dimension* that is not affine (like fuel economy) would require
  extending the model rather than dropping it into the existing form.
