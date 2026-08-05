import { decodeSubwayBoard, fetchSubwayFeed, PENN_123, subwayMetadata } from "@/lib/subway";

export async function GET(
  _request: Request,
  context: { params: Promise<{ stationId: string }> },
) {
  const { stationId } = await context.params;
  if (stationId !== PENN_123.id) {
    return Response.json({ error: `Unknown Subway station: ${stationId}` }, { status: 404 });
  }
  try {
    const board = decodeSubwayBoard(await fetchSubwayFeed(), subwayMetadata);
    return Response.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Subway departures for ${stationId} failed:`, error);
    return Response.json({ error: "Could not reach MTA" }, { status: 502 });
  }
}
