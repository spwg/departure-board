import {
  decodeSubwayTrip,
  fetchSubwayFeed,
  parseSubwayDepartureId,
  subwayMetadata,
} from "@/lib/subway";

/**
 * One exact live trip's remaining route.
 *
 * The identity carries the feed family it came from, so this reads that one
 * upstream bundle rather than every family. A trip MTA no longer publishes is
 * a 404: it has finished its run, or never existed.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const tripId = decodeURIComponent(id);
  const parsed = parseSubwayDepartureId(tripId);
  if (!parsed) {
    return Response.json({ error: `Unknown Subway trip: ${tripId}` }, { status: 404 });
  }

  try {
    const bytes = await fetchSubwayFeed(parsed.family);
    const trip = decodeSubwayTrip([{ family: parsed.family, bytes }], tripId, subwayMetadata);
    if (!trip) {
      return Response.json({ error: `Unknown Subway trip: ${tripId}` }, { status: 404 });
    }
    return Response.json(trip, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Subway trip ${tripId} failed:`, error);
    return Response.json({ error: "Could not reach MTA" }, { status: 502 });
  }
}
