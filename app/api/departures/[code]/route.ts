import { revalidateTag } from "next/cache";
import { normalizeDepartures, type Departure } from "@/lib/departures";
import {
  InvalidTokenError,
  TOKEN_TAG,
  fetchDepartures,
  fetchStationSchedule,
  invalidateToken,
  usingFixtures,
} from "@/lib/njtClient";
import { getStation } from "@/lib/stations";
import type { RawStationScheduleDeparture } from "@/lib/njtSchedule";


export type DeparturesResponse = {
  station: { code: string; name: string };
  departures: Departure[];
  fetchedAt: string;
  /** True when serving stand-in data because no API credentials are set. */
  fixtures: boolean;
};

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

// Direction is optional metadata. Do not let an unavailable daily schedule
// add its 10-second upstream timeout to every subsequent live-board refresh.
const DIRECTION_FAILURE_BACKOFF_MS = 5 * 60_000;
const directionFailureBackoff = new Map<string, number>();

async function getDepartures(stationCode: string): Promise<Departure[]> {
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
  let schedule: RawStationScheduleDeparture[] = [];
  const retryAt = directionFailureBackoff.get(stationCode);
  if (!retryAt || retryAt <= Date.now()) {
    try {
      schedule = await withFreshToken(() => fetchStationSchedule(stationCode));
      directionFailureBackoff.delete(stationCode);
    } catch (error) {
      // Direction is enrichment. A daily-schedule outage must never blank a
      // current live board or substitute schedule rows for realtime data.
      directionFailureBackoff.set(
        stationCode,
        Date.now() + DIRECTION_FAILURE_BACKOFF_MS,
      );
      console.error(`Direction schedule for ${stationCode} failed:`, error);
    }
  }

  const departures = normalizeDepartures(items, schedule);
  cache.set(stationCode, { at: now, departures });
  return departures;
}

/**
 * Returns an uncached normalized board for a known station code. Unknown codes
 * return 404; an upstream failure after at most one token refresh returns 502.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/departures/[code]">,
) {
  const { code } = await context.params;
  const station = getStation(code);

  if (!station) {
    return Response.json(
      { error: `Unknown station code: ${code}` },
      { status: 404 },
    );
  }

  let departures: Departure[];
  try {
    departures = await getDepartures(station.code);
  } catch (error) {
    console.error(`Departures for ${station.code} failed:`, error);
    return Response.json(
      { error: "Could not reach NJ Transit" },
      { status: 502 },
    );
  }

  const body: DeparturesResponse = {
    station: { code: station.code, name: station.name },
    departures,
    fetchedAt: new Date().toISOString(),
    fixtures: usingFixtures(),
  };

  return Response.json(body, {
    // The client polls on its own schedule; never let a browser or CDN serve
    // a stale board.
    headers: { "Cache-Control": "no-store" },
  });
}
