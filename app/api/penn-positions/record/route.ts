import { timingSafeEqual } from "node:crypto";
import { getDepartures } from "@/lib/departureBoard";
import { POSITION_STATION } from "@/lib/pennPositions";

/**
 * Refreshes the New York Penn board so position history and the board log keep
 * accruing when nobody has the board open. Loading the board is what records
 * both; this route only makes sure it happens.
 *
 * Called every 30 seconds by the always-on collector (lib/pennCollector) with
 * `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET configured the
 * route refuses every call rather than letting anyone spend NJT quota.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const departures = await getDepartures(POSITION_STATION, "collector");
    return Response.json(
      {
        departures: departures.length,
        positioned: departures.filter((departure) => departure.position).length,
        predicted: departures.filter((departure) => departure.position?.predictedTrack).length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Recording Penn positions failed:", error);
    return Response.json({ error: "Could not reach NJ Transit" }, { status: 502 });
  }
}
