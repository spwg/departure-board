import "server-only";
import { revalidateTag } from "next/cache";
import { normalizeDepartures, type Departure } from "./departures";
import {
  InvalidTokenError,
  TOKEN_TAG,
  fetchDepartures,
  invalidateToken,
} from "./njtClient";
import { PENN_STATION } from "./pennCollect";
import { addPredictions } from "./pennPredictions";

/**
 * Briefly shares departures between everyone watching the same station.
 *
 * Deliberately a plain in-process map rather than `use cache`: an error thrown
 * inside a cached function is wrapped by the Server Components runtime into an
 * opaque error, which would break the token-refresh branch below. Per-instance
 * caching is enough here — even several instances polling every 30 seconds stay
 * far below NJ Transit's 40,000 requests a day. The token, where the limit is
 * tight, is cached durably in lib/njtClient instead.
 */
const TTL_MS = 20_000;
const cache = new Map<string, { at: number; departures: Departure[] }>();

/**
 * The normalized board for a station, shared for 20 seconds. A rejected token
 * is refreshed once. New York Penn boards also carry the predicted tracks the
 * collector last published (lib/pennPredictions).
 */
export async function getDepartures(stationCode: string): Promise<Departure[]> {
  const hit = cache.get(stationCode);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.departures;

  const withFreshToken = async <T>(fetcher: () => Promise<T>): Promise<T> => {
    try {
      return await fetcher();
    } catch (error) {
      if (!(error instanceof InvalidTokenError)) throw error;
      // The token went bad before its cache lifetime ran out. Expire it now —
      // stale-while-revalidate would just hand the same dead token back — and
      // retry once with a fresh one.
      await invalidateToken(error.token);
      revalidateTag(TOKEN_TAG, { expire: 0 });
      return fetcher();
    }
  };

  const items = await withFreshToken(() => fetchDepartures(stationCode));
  let departures = normalizeDepartures(items);
  if (stationCode === PENN_STATION) departures = await addPredictions(departures);
  cache.set(stationCode, { at: now, departures });
  return departures;
}
