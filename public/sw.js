/*
 * Keeps the board usable on a platform with no signal.
 *
 * Three strategies, by request type:
 *   - Build assets are content-hashed, so they are served cache-first.
 *   - Pages are network-first and cached as you visit them, so a reload while
 *     offline still opens the board instead of a browser error page.
 *   - Departure data is network-first with a cached fallback, tagged with
 *     X-From-Cache so the UI can label the times it shows as stale rather than
 *     passing old departures off as current.
 */

const VERSION = "v1";
// Tested contract: navigation/data use network-first, hashed assets cache-first, and stale data is labeled.
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;
const CURRENT = new Set([SHELL_CACHE, DATA_CACHE]);

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => (CURRENT.has(name) ? null : caches.delete(name))),
      );
      await self.clients.claim();
    })(),
  );
});

/** Re-issues a cached response with a header marking it as not live. */
async function tagAsCached(response) {
  const headers = new Headers(response.headers);
  headers.set("X-From-Cache", "1");
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function networkFirst(request, cacheName, { tagStale = false } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return tagStale ? tagAsCached(cached) : cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/departures/")) {
    event.respondWith(networkFirst(request, DATA_CACHE, { tagStale: true }));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(
        () =>
          new Response(
            "<!doctype html><meta charset=utf-8><title>Offline</title>" +
              "<body style=\"font-family:system-ui;padding:2rem;text-align:center\">" +
              "<h1>Offline</h1><p>Open this station once while connected and it " +
              "will be available here next time.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          ),
      ),
    );
  }
});
