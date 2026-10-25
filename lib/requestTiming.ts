import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Where an API request's time goes: NJ Transit, its token, Redis, MTA's
 * feeds, decoding. Each route handler wraps itself in `withRequestTiming`;
 * code below it marks its steps with `timed` and `note` without being passed
 * anything, and outside a timed request both are no-ops.
 *
 * The result goes two places:
 *  - a Server-Timing header, which DevTools shows under the request's Timing
 *    tab;
 *  - one JSON log line per request that called upstream (`note("cache",
 *    "miss")`), failed, or was slow, so a slow board can be traced in Vercel's
 *    logs. Requests an instance's cache answered are not logged: they are
 *    most requests and take about a millisecond.
 */

type RequestTiming = {
  spans: { name: string; ms: number }[];
  notes: Record<string, string>;
};

const storage = new AsyncLocalStorage<RequestTiming>();

/** Requests slower than this are logged even when a cache answered them. */
const SLOW_MS = 1_000;

/**
 * Times one step of the current request. Steps run in parallel are each
 * recorded; one that repeats (a token retry) adds to its earlier time.
 */
export async function timed<T>(name: string, work: () => T | Promise<T>): Promise<T> {
  const timing = storage.getStore();
  if (!timing) return work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    const ms = performance.now() - start;
    const earlier = timing.spans.find((span) => span.name === name);
    if (earlier) earlier.ms += ms;
    else timing.spans.push({ name, ms });
  }
}

/** Records a fact about the current request, such as whether a cache answered it. */
export function note(name: string, value: string): void {
  const timing = storage.getStore();
  if (timing) timing.notes[name] = value;
}

/** Server-Timing names are tokens; descriptions are quoted strings. */
function serverTimingHeader({ spans, notes }: RequestTiming, totalMs: number): string {
  return [
    `total;dur=${totalMs.toFixed(1)}`,
    ...spans.map(({ name, ms }) => `${name};dur=${ms.toFixed(1)}`),
    ...Object.entries(notes).map(([name, value]) => `${name};desc="${value.replace(/["\\]/g, "")}"`),
  ].join(", ");
}

/**
 * Runs a route handler with timing collection, then stamps its response with
 * a Server-Timing header and logs the request if it called upstream, failed or
 * was slow. `route` names the handler in the log, such as "departures", and
 * `fields` identify what was asked for, such as the station.
 */
export async function withRequestTiming(
  route: string,
  fields: Record<string, string>,
  handle: () => Promise<Response>,
): Promise<Response> {
  const timing: RequestTiming = { spans: [], notes: {} };
  const start = performance.now();
  const response = await storage.run(timing, handle);
  const totalMs = performance.now() - start;

  response.headers.set("Server-Timing", serverTimingHeader(timing, totalMs));
  if (timing.notes.cache === "miss" || totalMs >= SLOW_MS || !response.ok) {
    console.log(JSON.stringify({
      event: "api_timing",
      route,
      ...fields,
      status: response.status,
      ms: Math.round(totalMs),
      ...Object.fromEntries(timing.spans.map(({ name, ms }) => [`${name}Ms`, Math.round(ms)])),
      ...timing.notes,
    }));
  }
  return response;
}
