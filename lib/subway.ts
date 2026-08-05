import { transit_realtime } from "gtfs-realtime-bindings";
import subwayHeadsigns from "./subway-headsigns.json";
import subwayStopNames from "./subway-stops.json";

export const PENN_123 = {
  id: "127",
  name: "34 St-Penn Station",
  routes: ["1", "2", "3"],
  directions: { N: "Uptown", S: "Downtown" },
} as const;

export type SubwayDeparture = {
  id: string;
  route: string;
  direction: SubwayDirection;
  destination: string;
  expectedTime: string;
};

export type SubwayDirection = (typeof PENN_123.directions)[keyof typeof PENN_123.directions];

export type SubwayBoard = {
  station: { id: string; name: string };
  departures: SubwayDeparture[];
  sourceTimestamp: string;
};

export type SubwayMetadata = {
  stopNames: Record<string, string>;
  headsigns?: Record<string, string>;
};

const ROUTE_COLORS: Record<string, string> = {
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
};

export function subwayRouteColor(route: string): string {
  return ROUTE_COLORS[route] ?? "#6CBE45";
}

function seconds(value: number | { toNumber(): number } | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}

/** Decode and project one official GTFS-Realtime feed into the Penn 1/2/3 board. */
export function decodeSubwayBoard(
  bytes: Uint8Array,
  metadata: SubwayMetadata,
): SubwayBoard {
  const feed = transit_realtime.FeedMessage.decode(bytes);
  const generated = seconds(feed.header.timestamp);
  if (!generated || !Number.isFinite(generated)) throw new Error("Missing MTA feed timestamp");

  const departures: SubwayDeparture[] = [];
  for (const entity of feed.entity) {
    const update = entity.tripUpdate;
    const tripId = update?.trip.tripId;
    const route = update?.trip.routeId;
    if (!update || !tripId || !route || !PENN_123.routes.includes(route as "1" | "2" | "3")) continue;

    const calls = update.stopTimeUpdate ?? [];
    const pennIndex = calls.findIndex((call) => call.stopId === `${PENN_123.id}N` || call.stopId === `${PENN_123.id}S`);
    if (pennIndex < 0) continue;
    const call = calls[pennIndex]!;
    const directionCode = call.stopId!.slice(-1) as "N" | "S";
    const hasLaterStop = pennIndex < calls.length - 1;
    // GTFS-Realtime permits one event to be omitted when arrival and departure
    // are the same. Only an arrival-only final call is a non-boardable terminal.
    const departureTime = seconds(call.departure?.time) ?? (hasLaterStop ? seconds(call.arrival?.time) : null);
    if (!departureTime || !hasLaterStop) continue;

    const finalStopId = calls.at(-1)?.stopId?.replace(/[NS]$/, "");
    const destination = metadata.headsigns?.[tripId] ?? (finalStopId ? metadata.stopNames[finalStopId] : undefined);
    if (!destination) continue;

    departures.push({
      id: `mta:${tripId}:${PENN_123.id}`,
      route,
      direction: PENN_123.directions[directionCode],
      destination,
      expectedTime: new Date(departureTime * 1000).toISOString(),
    });
  }

  departures.sort((a, b) => Date.parse(a.expectedTime) - Date.parse(b.expectedTime));
  return {
    station: { id: PENN_123.id, name: PENN_123.name },
    departures,
    sourceTimestamp: new Date(generated * 1000).toISOString(),
  };
}

const FEED_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs";
const TTL_MS = 15_000;
let cached: { at: number; bytes: Uint8Array } | null = null;
let pending: Promise<Uint8Array> | null = null;

export async function fetchSubwayFeed(): Promise<Uint8Array> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.bytes;
  if (pending) return pending;
  pending = fetch(FEED_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`MTA feed returned ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      // Decode before replacing last-good bytes so malformed payloads cannot poison the cache.
      decodeSubwayBoard(bytes, subwayMetadata);
      cached = { at: Date.now(), bytes };
      return bytes;
    })
    .catch((error) => {
      if (cached) return cached.bytes;
      throw error;
    })
    .finally(() => { pending = null; });
  return pending;
}

export const subwayMetadata: SubwayMetadata = {
  stopNames: subwayStopNames,
  headsigns: subwayHeadsigns,
};
