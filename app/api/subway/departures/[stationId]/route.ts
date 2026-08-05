import { decodeSubwayBoard, fetchSubwayFeedsForStation, getSubwayStation, subwayMetadata } from "@/lib/subway";

export async function GET(
  _request: Request,
  context: { params: Promise<{ stationId: string }> },
) {
  const { stationId } = await context.params;
  if (!getSubwayStation(stationId)) {
    return Response.json({ error: `Unknown Subway station: ${stationId}` }, { status: 404 });
  }
  try {
    const batch = await fetchSubwayFeedsForStation(stationId);
    const board = {
      ...decodeSubwayBoard(batch.feeds, stationId, subwayMetadata),
      unavailableFeedFamilies: batch.unavailableFamilies,
    };
    return Response.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Subway departures for ${stationId} failed:`, error);
    return Response.json({ error: "Could not reach MTA" }, { status: 502 });
  }
}
