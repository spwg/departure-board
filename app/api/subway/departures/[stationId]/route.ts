import { decodeSubwayBoard, fetchSubwayFeedsForStation, getSubwayStation, subwayMetadata } from "@/lib/subway";

/**
 * A live board for one MTA station complex, or for the several provider
 * stations one Interchange view reaches, given as a comma-separated list.
 * Their identities stay separate in the response; only direction labels merge.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ stationId: string }> },
) {
  const { stationId } = await context.params;
  const stationIds = decodeURIComponent(stationId).split(",").filter(Boolean);
  if (stationIds.length === 0 || !stationIds.every(getSubwayStation)) {
    return Response.json({ error: `Unknown Subway station: ${stationId}` }, { status: 404 });
  }
  try {
    const batch = await fetchSubwayFeedsForStation(stationIds);
    const board = {
      ...decodeSubwayBoard(batch.feeds, stationIds, subwayMetadata),
      unavailableFeedFamilies: batch.unavailableFamilies,
    };
    return Response.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Subway departures for ${stationId} failed:`, error);
    return Response.json({ error: "Could not reach MTA" }, { status: 502 });
  }
}
