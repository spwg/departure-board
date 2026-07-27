import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { normalizeDepartures, type Departure } from "@/lib/departures";
import {
  InvalidTokenError,
  TOKEN_TAG,
  fetchDepartures,
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

const departuresTag = (stationCode: string) => `departures:${stationCode}`;

/**
 * Departures for one station, briefly shared between everyone watching it.
 *
 * The short cache means a station polled every 30 seconds by several clients
 * still costs roughly one upstream call per cache window, which keeps us well
 * inside NJT's 40,000 requests/day.
 */
async function cachedDepartures(stationCode: string): Promise<Departure[]> {
  "use cache";
  cacheLife("departures");
  cacheTag(departuresTag(stationCode));

  const items = await fetchDepartures(stationCode);
  return normalizeDepartures(items, stationCode);
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
    try {
      departures = await cachedDepartures(station.code);
    } catch (error) {
      if (!(error instanceof InvalidTokenError)) throw error;
      // The token went bad before its cache lifetime ran out. Drop it and the
      // station's cached departures, then retry once with a fresh token.
      revalidateTag(TOKEN_TAG);
      revalidateTag(departuresTag(station.code));
      departures = await cachedDepartures(station.code);
    }
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
