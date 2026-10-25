import type { Departure } from "@/lib/departures";
import { getDepartures } from "@/lib/departureBoard";
import { usingFixtures } from "@/lib/njtClient";
import { njtFailureResponse } from "@/lib/njtFailure";
import { withRequestTiming } from "@/lib/requestTiming";
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
 * return 404; an upstream failure after at most one token refresh returns 502,
 * or 503 while NJ Transit sign-in is paused (lib/njtFailure).
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/departures/[code]">,
) {
  const { code } = await context.params;
  return withRequestTiming("departures", { station: code.slice(0, 16) }, () => departuresResponse(code));
}

async function departuresResponse(code: string): Promise<Response> {
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
    return njtFailureResponse(error);
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
