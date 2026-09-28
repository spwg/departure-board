/**
 * The New York Penn collector: a Cloudflare Worker whose cron trigger runs
 * once a minute, around the clock, independent of the Vercel app. Each run
 * calls NJ Transit itself and writes history, the board log and the current
 * predictions to Upstash (lib/pennCollect); the app only reads predictions
 * back. See docs/adr/0008-penn-predicted-tracks-and-board-log.md.
 *
 * Secrets (wrangler secret put): NJT_API_USERNAME, NJT_API_PASSWORD,
 * UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN. With the nodejs_compat
 * flag they arrive in process.env, which the shared modules read.
 */
import { fetchToken, requestDepartures, requestVehicles } from "../lib/njtApi";
import { getOrCreateStoredToken, invalidateStoredToken, redisCommand } from "../lib/njtTokenStore";
import { collectPenn } from "../lib/pennCollect";

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
  } catch (error) {
    // The minute goes uncounted in the board log, which shows the gap.
    console.error(JSON.stringify({ event: "penn-collect-failed", at: new Date().toISOString(), error: String(error) }));
  }
}

const worker = {
  scheduled(_controller: unknown, _env: unknown, context: ExecutionContext) {
    context.waitUntil(collect());
  },
};

export default worker;
