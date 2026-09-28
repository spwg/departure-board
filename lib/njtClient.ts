import "server-only";
import { unstable_cache } from "next/cache";
import type { RawDeparture } from "./departures";
import { fixtureDepartures, fixtureStopList } from "./fixtures";
import { fetchToken, requestDepartures, requestStopList } from "./njtApi";
import {
  getOrCreateStoredToken,
  invalidateStoredToken,
} from "./njtTokenStore";
import type { RawStopList } from "./stops";

export { InvalidTokenError } from "./njtApi";

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

/**
 * RailData token shared by all Vercel function instances and deployments.
 *
 * Next's Data Cache avoids routine Redis reads. Redis remains the source of
 * truth and protects Data Cache misses with an atomic writer lock. The token
 * stays cached until NJT rejects it; there is no periodic token minting.
 */
const getToken = unstable_cache(
  () => getOrCreateStoredToken(fetchToken),
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
  await invalidateStoredToken(rejectedToken);
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
