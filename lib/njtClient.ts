import "server-only";
import { unstable_cache } from "next/cache";
import type { RawDeparture } from "./departures";
import { fixtureDepartures, fixtureStopList } from "./fixtures";
import { fetchToken, requestDepartures, requestStopList } from "./njtApi";
import {
  RedisUnavailableError,
  TokenCooldownError,
  getOrCreateStoredToken,
  invalidateStoredToken,
  mintCooldownMs,
} from "./njtTokenStore";
import type { RawStopList } from "./stops";

export { InvalidTokenError } from "./njtApi";
export { TokenCooldownError } from "./njtTokenStore";

/**
 * The Next.js app's client for NJ Transit's RailData API (lib/njtApi).
 *
 * Two constraints from NJT's API manual shape this file:
 *
 *  - getToken is capped at 10 calls per day. A module-level variable would not
 *    survive serverless cold starts, so the token is held in Next's durable
 *    Data Cache (`unstable_cache`) and refreshed on demand via the `njt-token`
 *    tag when the API reports it has gone bad.
 *  - Data calls are capped at 40,000 per day, comfortably above what 30-second
 *    polling needs once responses are briefly shared between clients.
 */

export const TOKEN_TAG = "njt-token";

/** True when fixtures are forced or API credentials are incomplete. */
export function usingFixtures(): boolean {
  return process.env.NJT_USE_FIXTURES === "true" || !process.env.NJT_API_USERNAME || !process.env.NJT_API_PASSWORD;
}

/** This instance's minting while Redis is unavailable: one at a time, and a cooldown after a failure. */
let localMint: Promise<string> | null = null;
let localRetryAt = 0;

/**
 * Mints a token without Redis's lock or shared cooldown, for when Upstash is
 * down or out of its monthly allowance. The token still lands in the Data
 * Cache below, which every instance shares, so this runs about once rather
 * than per request; instances that miss the cache at the same moment may each
 * mint one.
 */
function mintWithoutRedis(): Promise<string> {
  if (Date.now() < localRetryAt) return Promise.reject(new TokenCooldownError(localRetryAt));
  localMint ??= fetchToken()
    .catch((error: unknown) => {
      localRetryAt = Date.now() + mintCooldownMs(error);
      throw error;
    })
    .finally(() => {
      localMint = null;
    });
  return localMint;
}

/** The shared token from Redis, or one minted without it while Redis is unavailable. */
async function sharedToken(): Promise<string> {
  try {
    return await getOrCreateStoredToken(fetchToken);
  } catch (error) {
    if (!(error instanceof RedisUnavailableError)) throw error;
    console.warn("Upstash Redis unavailable; minting the NJT token without it:", error.message);
    return mintWithoutRedis();
  }
}

/**
 * RailData token shared by all Vercel function instances and deployments.
 *
 * Next's Data Cache avoids routine Redis reads. Redis remains the source of
 * truth and protects Data Cache misses with an atomic writer lock; while Redis
 * is unavailable the Data Cache alone holds the token. The token stays cached
 * until NJT rejects it; there is no periodic token minting.
 */
const getToken = unstable_cache(
  sharedToken,
  ["njt-token"],
  {
    revalidate: false,
    tags: [TOKEN_TAG],
  },
);

/**
 * Deletes a rejected token only if Redis still contains that exact value.
 *
 * The compare-and-delete is atomic, so a slow request carrying an old token
 * cannot erase a newer token minted by another request.
 */
export async function invalidateToken(rejectedToken: string): Promise<void> {
  try {
    await invalidateStoredToken(rejectedToken);
  } catch (error) {
    // Without Redis there is no stored copy to delete; the caller still drops
    // the Data Cache entry, and the next read mints without Redis.
    if (!(error instanceof RedisUnavailableError)) throw error;
  }
}

/**
 * Raw departures for a station: fixture data when either credential is absent,
 * otherwise RailData's. A rejected token throws InvalidTokenError; the caller
 * drops it and retries, since only route handlers may call revalidateTag.
 */
export async function fetchDepartures(stationCode: string): Promise<RawDeparture[]> {
  if (usingFixtures()) return fixtureDepartures(stationCode);
  return requestDepartures(await getToken(), stationCode);
}

/** The stops a train makes, by train number. */
export async function fetchStopList(trainId: string): Promise<RawStopList> {
  if (usingFixtures()) return fixtureStopList(trainId);
  return requestStopList(await getToken(), trainId);
}
