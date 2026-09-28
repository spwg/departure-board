/**
 * The always-on New York Penn collector: a timer inside a long-running
 * `next start` server that loads the NY board every 30 seconds, whether or not
 * anyone has it open, so position history and the board log accrue around the
 * clock. See docs/adr/0008-always-on-penn-collector.md.
 *
 * It asks its own server for /api/penn-positions/record rather than calling
 * getDepartures directly, because the NJT token lives in Next's Data Cache,
 * which only exists inside a request. It is switched on by PENN_COLLECTOR=true
 * and must only be on a server that stays up: a serverless function is frozen
 * between requests and its timer would silently stop.
 */

export const DEFAULT_INTERVAL_SECONDS = 30;
/** A load slower than this is abandoned, so ticks never pile up. */
const TIMEOUT_MS = 25_000;

export type CollectorOptions = {
  url: string;
  secret: string;
  intervalMs: number;
  fetch?: typeof fetch;
  log?: (line: string) => void;
};

/** One board load; resolves to a structured log line and never throws. */
export async function collectOnce({
  url,
  secret,
  fetch: fetchImpl = fetch,
}: Pick<CollectorOptions, "url" | "secret" | "fetch">): Promise<Record<string, unknown>> {
  const started = Date.now();
  const at = new Date(started).toISOString();
  try {
    const response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    return { event: "penn-collect", at, ok: response.ok, status: response.status, ms: Date.now() - started, ...body };
  } catch (error) {
    return { event: "penn-collect", at, ok: false, ms: Date.now() - started, error: String(error) };
  }
}

/**
 * Loads the board every `intervalMs`, starting one interval from now so the
 * server is listening first. Each tick waits for the last, so a slow NJT never
 * stacks requests. Returns a function that stops it.
 */
export function startCollector(options: CollectorOptions): () => void {
  const log = options.log ?? ((line: string) => console.log(line));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const tick = async () => {
    const result = await collectOnce(options);
    log(JSON.stringify(result));
    if (!stopped) timer = setTimeout(tick, options.intervalMs);
  };
  timer = setTimeout(tick, options.intervalMs);

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** Collector options from the environment, or why the collector cannot start. */
export function collectorOptionsFromEnv(
  env: Record<string, string | undefined>,
): CollectorOptions | { error: string } {
  const secret = env.CRON_SECRET;
  if (!secret) return { error: "PENN_COLLECTOR is on but CRON_SECRET is not set" };
  const seconds = Number(env.PENN_COLLECTOR_INTERVAL_SECONDS ?? DEFAULT_INTERVAL_SECONDS);
  if (!Number.isFinite(seconds) || seconds < 10) {
    return { error: "PENN_COLLECTOR_INTERVAL_SECONDS must be a number of seconds, at least 10" };
  }
  const port = env.PORT ?? "3000";
  return {
    url: `http://127.0.0.1:${port}/api/penn-positions/record`,
    secret,
    intervalMs: seconds * 1000,
  };
}
