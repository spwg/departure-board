/**
 * The New York Penn collector: a Cloudflare Worker whose cron trigger runs
 * once a minute, around the clock, independent of the Vercel app. Each run
 * calls NJ Transit itself and writes history, the board log and the current
 * predictions to Upstash (lib/pennCollect); the app only reads predictions
 * back. See docs/adr/0008-penn-predicted-tracks-and-board-log.md.
 *
 * Secrets (wrangler secret put): NJT_API_USERNAME, NJT_API_PASSWORD,
 * UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, and optionally
 * HEALTHCHECK_URL. With the nodejs_compat flag they arrive in process.env,
 * which the shared modules read.
 */
import { fetchToken, requestDepartures, requestVehicles } from "../lib/njtApi";
import { getOrCreateStoredToken, invalidateStoredToken, redisCommand } from "../lib/njtTokenStore";
import { collectPenn, type CollectSummary } from "../lib/pennCollect";

type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };

export async function collect(): Promise<void> {
  try {
    const summary = await collectPenn({
      redis: redisCommand,
      token: {
        // The same token the app uses, minted at most once for both.
        get: () => getOrCreateStoredToken(fetchToken),
        invalidate: invalidateStoredToken,
      },
      njt: { departures: requestDepartures, vehicles: requestVehicles },
    });
    console.log(JSON.stringify(summary));
    await reportHealthy(summary);
  } catch (error) {
    // The minute goes uncounted in the board log, which shows the gap.
    console.error(JSON.stringify({ event: "penn-collect-failed", at: new Date().toISOString(), error: String(error) }));
  }
}

/**
 * A dead man's switch: after each run that could predict — board, vehicle feed
 * and history all answered — ping HEALTHCHECK_URL (a Healthchecks.io check).
 * The monitor alerts when pings stop, so errors, outages, CPU-limit kills and
 * a cron that never fires all surface the same way, while one bad minute stays
 * quiet. A failed ping is ignored: monitoring must never break collection.
 */
export async function reportHealthy(summary: CollectSummary): Promise<void> {
  const url = process.env.HEALTHCHECK_URL;
  if (!url || !summary.vehicles || !summary.history) return;
  try {
    // fetch resolves on any HTTP status; a revoked URL (4xx) or an outage or
    // throttling (429/5xx) left the check un-pinged all the same.
    const response = await fetch(url, { method: "POST", body: JSON.stringify(summary), signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error(JSON.stringify({ event: "healthcheck-ping-failed", error: String(error) }));
  }
}

const worker = {
  scheduled(_controller: unknown, _env: unknown, context: ExecutionContext) {
    context.waitUntil(collect());
  },
};

export default worker;
