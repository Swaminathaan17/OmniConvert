# 0004 — Offline-first service worker that never caches the API

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Every unit conversion, custom-unit, collection, and batch operation runs on the
device, so the app is only online-dependent for currency rates. Users asked to
install it and keep using the core tools without a connection. A naive service
worker that caches everything would happily cache stale exchange rates and
leave a wrong conversion frozen until the cache was cleared.

## Decision

A hand-written service worker (`public/sw.js`, no build step) implements three
rules:

- **Precache the shell.** On install it caches the app shell and static icons
  so a cold start works offline.
- **Navigation = network-first with a cached-shell fallback.** A document
  request tries the network, refreshes the cached shell on success, and falls
  back to the cached shell when offline.
- **API requests are never intercepted.** Any request whose path contains
  `/api/` is passed straight through to the network. Non-GET requests are also
  left alone. Cross-origin requests are ignored by the worker.

Static same-origin assets use cache-first with a runtime cache. Old
`omni-convert-*` caches are deleted on activation, and the worker calls
`skipWaiting`/`clients.claim` so updates take effect promptly.

The worker is registered only in production builds
(`import.meta.env.PROD`), so development keeps an uncached module graph for hot
reloading. Registration uses `import.meta.env.BASE_URL` so it respects the
deployment base path.

## Consequences

- The core tools load and work offline; currency rates require a connection and
  fail honestly when it is missing.
- Because the API is never cached, an offline currency page shows the error
  state rather than a stale rate — consistent with ADR 0003.
- The worker is intentionally minimal so it stays auditable; it is not a
  general caching framework.
