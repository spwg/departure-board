/*
 * Keeps the board usable on a platform with no signal.
 *
 * Three strategies, by request type:
 *   - Build assets are content-hashed, so they are served cache-first.
 *   - Pages are network-first and cached as you visit them, so a reload while
 *     offline still opens the board instead of a browser error page.
 *   - Departure and stop data is network-first with a cached fallback, tagged
 *     with X-From-Cache so the UI can label the times it shows as stale rather
 *     than passing old times off as current.
 *
 * Home also asks the worker to fetch the nearest boards and the rider's
 * favorites ahead of time ("warm-boards"), so a board opened on a platform
 * with no signal shows its last times instead of the offline page.
 */

const VERSION = "v2";
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

/** Records when a data response was live so cached fallbacks can report age. */
function tagWithLiveTime(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Last-Live-At", new Date().toISOString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function networkFirst(request, cacheName, { tagStale = false } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cachedResponse = tagStale
        ? tagWithLiveTime(response.clone())
        : response.clone();
      cache.put(request, cachedResponse);
    }
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

function isDataPath(pathname) {
  return (
    pathname.startsWith("/api/departures/") ||
    pathname.startsWith("/api/subway/departures/") ||
    pathname.startsWith("/api/stops/")
  );
}

/** Only board pages and board data may be fetched ahead. */
function isWarmablePath(pathname) {
  return (
    pathname.startsWith("/station/") ||
    pathname.startsWith("/subway/station/") ||
    pathname.startsWith("/api/departures/") ||
    pathname.startsWith("/api/subway/departures/")
  );
}

/** Fetches one board page or data URL and keeps it for an offline open. */
async function warm(url) {
  const data = isDataPath(url.pathname);
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return;
    const cache = await caches.open(data ? DATA_CACHE : SHELL_CACHE);
    await cache.put(url.href, data ? tagWithLiveTime(response) : response);
  } catch {
    // Fetching ahead is best-effort; the board fetches for itself when opened.
  }
}

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type !== "warm-boards" || !Array.isArray(message.urls)) return;

  const urls = message.urls
    .slice(0, 20)
    .map((value) => {
      try {
        return new URL(String(value), self.location.origin);
      } catch {
        return null;
      }
    })
    .filter(
      (url) =>
        url && url.origin === self.location.origin && isWarmablePath(url.pathname),
    );
  event.waitUntil(Promise.all(urls.map(warm)));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isDataPath(url.pathname)) {
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
