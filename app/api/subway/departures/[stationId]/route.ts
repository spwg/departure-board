import { decodeSubwayBoard, fetchSubwayFeedsForStation, getSubwayStation, subwayMetadata } from "@/lib/subway";
import { decodeRouteParam } from "@/lib/routeParams";
import { timed, withRequestTiming } from "@/lib/requestTiming";

/** The largest station complex has five members; anything longer is not a real request. */
const MAX_STATION_IDS = 8;

/**
 * A live board for one MTA station complex, given as a comma-separated list
 * when the caller intentionally requests several complex members. Their
 * identities stay separate in the response; only direction labels merge.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ stationId: string }> },
) {
  const { stationId } = await context.params;
  return withRequestTiming("subway-departures", { station: stationId.slice(0, 40) }, () => boardResponse(request, stationId));
}

async function boardResponse(request: Request, stationId: string): Promise<Response> {
  const stationIds = [...new Set(decodeRouteParam(stationId).split(",").filter(Boolean))];
  const exact = new URL(request.url).searchParams.get("exact") === "true";
  if (stationIds.length > MAX_STATION_IDS) {
    return Response.json({ error: "Too many Subway stations" }, { status: 400 });
  }
  if (stationIds.length === 0 || !stationIds.every(getSubwayStation)) {
    return Response.json({ error: `Unknown Subway station: ${stationId}` }, { status: 404 });
  }
  try {
    const batch = await timed("mta", () => fetchSubwayFeedsForStation(stationIds));
    const board = {
      ...await timed("decode", () => decodeSubwayBoard(batch.feeds, stationIds, subwayMetadata, { expandComplex: !exact })),
      unavailableFeedFamilies: batch.unavailableFamilies,
    };
    return Response.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Subway departures for ${stationId} failed:`, error);
    return Response.json({ error: "Could not reach MTA" }, { status: 502 });
  }
}
