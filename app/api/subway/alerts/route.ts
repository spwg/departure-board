import { isSubwayRoute } from "@/lib/subway";
import { getSubwayAlertSnapshot } from "@/lib/subwayAlertSource";

/**
 * MTA's alerts for one Subway route. The source owns its short server cache;
 * this response stays uncached so a browser never keeps a stale list that
 * would wrongly revive a dismissed alert.
 */
export async function GET(request: Request) {
  const route = new URL(request.url).searchParams.get("route")?.trim().toUpperCase() ?? "";
  if (!isSubwayRoute(route)) {
    return Response.json({ error: "Unknown Subway route" }, { status: 400 });
  }

  try {
    return Response.json(await getSubwayAlertSnapshot(route), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Subway alerts failed:", error);
    return Response.json({ error: "Could not reach MTA service alerts" }, { status: 502 });
  }
}
