import { track } from "@vercel/analytics";

/**
 * How long a rider waits from opening a board to seeing its departures — the
 * wait Speed Insights cannot see, because the departures load after the page
 * does (from /api, after hydration).
 *
 * A full page load counts from the browser's navigation start; an in-app
 * navigation counts from when the App Router started it
 * (instrumentation-client.ts). A wait the page spent hidden, such as a tab
 * opened in the background, is not a wait anyone sat through and is skipped.
 *
 * Each wait is measured with `performance.measure` (DevTools' Performance
 * panel shows it, with the server's share from Server-Timing) and sent to
 * Vercel Web Analytics as a "Board ready" event. Custom events need a Pro or
 * Enterprise plan; on Hobby `track` is accepted and dropped.
 */

type BoardSystem = "njt" | "subway";

/** performance.now() when the current in-app navigation began; null on the first page. */
let navigationStart: number | null = null;
let hiddenSinceStart = false;

/** Called by instrumentation-client.ts when the App Router starts a navigation. */
export function markNavigationStart(): void {
  navigationStart = performance.now();
  hiddenSinceStart = document.visibilityState !== "visible";
}

/** Called by instrumentation-client.ts whenever the page is hidden. */
export function markHidden(): void {
  hiddenSinceStart = true;
}

/** The server's own time for the latest request to `path`, from its Server-Timing header. */
function serverMs(path: string): number | null {
  const entries = performance.getEntriesByName(new URL(path, location.href).href, "resource");
  const latest = entries.at(-1) as PerformanceResourceTiming | undefined;
  return latest?.serverTiming?.find((entry) => entry.name === "total")?.duration ?? null;
}

/** Coarse buckets, because the Events panel lists values rather than charting them. */
function waitBucket(ms: number): string {
  if (ms < 500) return "<0.5s";
  if (ms < 1_000) return "0.5-1s";
  if (ms < 2_000) return "1-2s";
  if (ms < 4_000) return "2-4s";
  return "4s+";
}

/**
 * Reports a board's first departures on screen, given the API path that
 * delivered them. Call it once per board, on its first successful load.
 */
export function reportBoardReady(system: BoardSystem, apiPath: string): void {
  try {
    if (hiddenSinceStart || document.visibilityState !== "visible") return;
    const navigation = navigationStart === null ? "load" : "in-app";
    const start = navigationStart ?? 0;
    const end = performance.now();
    performance.measure(`board ready (${system}, ${navigation})`, {
      start,
      end,
      detail: { serverMs: serverMs(apiPath) },
    });
    track("Board ready", { board: `${system} ${navigation}`, wait: waitBucket(end - start) });
  } catch {
    // Measurement must never break the board.
  }
}
