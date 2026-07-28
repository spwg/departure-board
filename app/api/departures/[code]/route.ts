import { revalidateTag } from "next/cache";
import { normalizeDepartures, type Departure } from "@/lib/departures";
import {
  InvalidTokenError,
  TOKEN_TAG,
  fetchDepartures,
  invalidateToken,
  usingFixtures,
} from "@/lib/njtClient";
import { getStation } from "@/lib/stations";

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

async function getDepartures(stationCode: string): Promise<Departure[]> {
  const hit = cache.get(stationCode);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.departures;

  let items;
  try {
    items = await fetchDepartures(stationCode);
  } catch (error) {
    if (!(error instanceof InvalidTokenError)) throw error;
    // The token went bad before its cache lifetime ran out. Expire it now —
    // stale-while-revalidate would just hand the same dead token back — and
    // retry once with a fresh one.
    await invalidateToken(error.token);
    revalidateTag(TOKEN_TAG, { expire: 0 });
    items = await fetchDepartures(stationCode);
  }

  const departures = normalizeDepartures(items);
  cache.set(stationCode, { at: now, departures });
  return departures;
}

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
