import { getServiceAdvisorySnapshot } from "@/lib/serviceAdvisorySource";
import { getStation } from "@/lib/stations";

/** A page asks for one line; a few covers any future caller. */
const MAX_LINE_CODES = 4;

/**
 * Returns contextual official RSS notices for one view. The RSS adapter owns
 * its short server cache; this response remains uncached so a browser never
 * keeps a dismissal-invalidating old list after the source has refreshed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const station = searchParams.get("station");
  const stationEntry = station ? getStation(station) : undefined;
  // Each code is matched against every notice, so only a few short ones, each
  // once: an unbounded list would be unbounded work.
  const lineCodes = [
    ...new Set(
      searchParams
        .getAll("line")
        .map((line) => line.trim().toUpperCase())
        .filter((line) => /^[A-Z0-9]{1,4}$/.test(line)),
    ),
  ].slice(0, MAX_LINE_CODES);

  try {
    const snapshot = await getServiceAdvisorySnapshot(
      stationEntry
        ? { station: { code: stationEntry.code, name: stationEntry.name, lines: stationEntry.lines } }
        : { lineCodes },
    );
    return Response.json(
      snapshot,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Rail advisories failed:", error);
    return Response.json(
      { error: "Could not reach NJ Transit service advisories" },
      { status: 502 },
    );
  }
}
