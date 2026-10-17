/*
 * OmniConvert Studio service worker.
 *
 * Strategy:
 *   - Precache the application shell so the workspace loads offline.
 *   - Navigation requests use network-first with a cached-shell fallback,
 *     which keeps the SPA usable without a connection.
 *   - Same-origin static assets use cache-first with a runtime cache.
 *   - Requests to `/api/` are never intercepted or cached: currency rates
 *     must always be fresh or fail explicitly.
 */

const VERSION = "omni-convert-v1";
const CACHE_NAME = `omni-convert-${VERSION}`;
const SHELL = "./";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const shell = [
        SHELL,
        "./manifest.webmanifest",
        "./favicon.svg",
        "./icon-maskable.svg",
      ];
      await Promise.all(
        shell.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("omni-convert-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isApiRequest(url) {
  return url.pathname.includes("/api/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch cross-origin or API traffic.
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(SHELL, response.clone());
          return response;
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);
          const cached = (await cache.match(SHELL)) || (await cache.match(request));
          if (cached) return cached;
          throw error;
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === "basic") {
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});
