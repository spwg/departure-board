import type { Departure } from "@/lib/departures";
import { getDepartures } from "@/lib/departureBoard";
import { usingFixtures } from "@/lib/njtClient";
import { getStation } from "@/lib/stations";


export type DeparturesResponse = {
  station: { code: string; name: string };
  departures: Departure[];
  fetchedAt: string;
  /** True when serving stand-in data because no API credentials are set. */
  fixtures: boolean;
};

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
