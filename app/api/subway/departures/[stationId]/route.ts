import { decodeSubwayBoard, fetchSubwayFeedsForStation, getSubwayStation, subwayMetadata } from "@/lib/subway";

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
  const stationIds = decodeURIComponent(stationId).split(",").filter(Boolean);
  const exact = new URL(request.url).searchParams.get("exact") === "true";
  if (stationIds.length === 0 || !stationIds.every(getSubwayStation)) {
    return Response.json({ error: `Unknown Subway station: ${stationId}` }, { status: 404 });
  }
  try {
    const batch = await fetchSubwayFeedsForStation(stationIds);
    const board = {
      ...decodeSubwayBoard(batch.feeds, stationIds, subwayMetadata, { expandComplex: !exact }),
      unavailableFeedFamilies: batch.unavailableFamilies,
    };
    return Response.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Subway departures for ${stationId} failed:`, error);
    return Response.json({ error: "Could not reach MTA" }, { status: 502 });
  }
}
