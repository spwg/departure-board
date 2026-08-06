import { transit_realtime } from "gtfs-realtime-bindings";
import subwayHeadsigns from "./subway-headsigns.json";
import subwayStations from "./subway-stations.json";
import subwayStopNames from "./subway-stops.json";

export type SubwayStation = {
  id: string;
  name: string;
  complexId: string;
  routes: string[];
  latitude: number;
  longitude: number;
  directions: Partial<Record<"N" | "S", string>>;
};

export const SUBWAY_STATIONS = subwayStations as SubwayStation[];

export const PENN_123 = {
  id: "128",
  name: "34 St-Penn Station",
  routes: ["1", "2", "3"],
  directions: { N: "Uptown", S: "Downtown" },
} as const;

export type SubwayDeparture = {
  id: string;
  route: string;
  direction: string;
  destination: string;
  /**
   * MTA's own name for the first stop this train makes after the board's
   * station — the cue on the sign inside the train. A departure with no later
   * stop is never emitted, so this is always present.
   */
  nextStop: string;
  /** Provider-qualified stop/headsign identity for destination filtering. */
  destinationId?: string;
  expectedTime: string;
  stationId: string;
};

export type SubwayBoard = {
  station: { id: string; name: string; memberIds: string[]; routes: string[] };
  departures: SubwayDeparture[];
  sourceTimestamp: string;
  feedTimestamps: Partial<Record<FeedFamily, string>>;
  unavailableFeedFamilies?: FeedFamily[];
};

export type SubwayMetadata = {
  stopNames: Record<string, string>;
  stations: SubwayStation[];
  headsigns?: Record<string, string>;
};

const ROUTE_COLORS: Record<string, string> = {
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
  "4": "#00933C", "5": "#00933C", "6": "#00933C", "6X": "#00933C",
  "7": "#B933AD", "7X": "#B933AD",
  A: "#0039A6", C: "#0039A6", E: "#0039A6",
  B: "#FF6319", D: "#FF6319", F: "#FF6319", FX: "#FF6319", M: "#FF6319",
  G: "#6CBE45", J: "#996633", Z: "#996633", L: "#A7A9AC",
  N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A",
  S: "#808183", SI: "#0039A6", SIR: "#0039A6",
};

export function subwayRouteColor(route: string): string {
  return ROUTE_COLORS[route] ?? "#808183";
}

export function getSubwayStation(stationId: string): SubwayStation | undefined {
  return SUBWAY_STATIONS.find((station) => station.id === stationId);
}

export function getSubwayStationMembers(stationId: string, metadata: SubwayMetadata = subwayMetadata): SubwayStation[] {
  const selected = metadata.stations.find((station) => station.id === stationId);
  if (!selected) return [];
  return metadata.stations.filter((station) => station.complexId === selected.complexId);
}

function seconds(value: number | { toNumber(): number } | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}

function parentStopId(stopId: string): string {
  return stopId.replace(/[NS]$/, "");
}

/** Decode and project official GTFS-Realtime feed families into one station-complex board. */
export function decodeSubwayBoard(
  feedSnapshots: SubwayFeedSnapshot[],
  stationId: string,
  metadata: SubwayMetadata,
): SubwayBoard {
  const selected = metadata.stations.find((station) => station.id === stationId);
  if (!selected) throw new Error(`Unknown Subway station: ${stationId}`);
  const members = getSubwayStationMembers(stationId, metadata);
  const memberById = new Map(members.map((station) => [station.id, station]));
  const feeds = feedSnapshots.map(({ family, bytes }) => ({ family, feed: transit_realtime.FeedMessage.decode(bytes) }));
  const generated = feeds.map(({ feed }) => seconds(feed.header.timestamp));
  if (generated.some((timestamp) => !timestamp || !Number.isFinite(timestamp))) {
    throw new Error("Missing MTA feed timestamp");
  }

  const departures: SubwayDeparture[] = [];
  for (const { family, feed } of feeds) for (const entity of feed.entity) {
    const update = entity.tripUpdate;
    const tripId = update?.trip.tripId;
    const route = update?.trip.routeId;
    if (!update || !tripId || !route) continue;

    const calls = update.stopTimeUpdate ?? [];
    const stationIndex = calls.findIndex((call) => call.stopId && memberById.has(parentStopId(call.stopId)));
    if (stationIndex < 0) continue;
    const call = calls[stationIndex]!;
    const member = memberById.get(parentStopId(call.stopId!))!;
    const hasLaterStop = stationIndex < calls.length - 1;
    const departureTime = seconds(call.departure?.time) ?? (hasLaterStop ? seconds(call.arrival?.time) : null);
    if (!departureTime || !hasLaterStop) continue;

    const finalStopId = calls.at(-1)?.stopId && parentStopId(calls.at(-1)!.stopId!);
    const headsign = metadata.headsigns?.[tripId];
    const destination = headsign ?? (finalStopId ? metadata.stopNames[finalStopId] : undefined);
    if (!destination) continue;

    // The next stop comes from this trip's own remaining sequence, never from
    // a static schedule and never inferred: whatever the train calls at next is
    // what its interior sign will say, express running included.
    const followingStopId = calls[stationIndex + 1]!.stopId;
    const nextStop = followingStopId
      ? metadata.stopNames[parentStopId(followingStopId)]
      : undefined;
    if (!nextStop) continue;

    const directionCode = call.stopId!.slice(-1) as "N" | "S";
    const direction = member.directions[directionCode] || destination;

    departures.push({
      id: `mta:${family}:${tripId}:${member.id}`,
      route,
      direction,
      destination,
      nextStop,
      destinationId: headsign
        ? `mta:headsign:${headsign.toLowerCase()}`
        : `mta:stop:${finalStopId}`,
      expectedTime: new Date(departureTime * 1000).toISOString(),
      stationId: member.id,
    });
  }

  departures.sort((a, b) => Date.parse(a.expectedTime) - Date.parse(b.expectedTime));
  return {
    station: {
      id: selected.id,
      name: selected.name,
      memberIds: members.map((station) => station.id),
      routes: [...new Set(members.flatMap((station) => station.routes))],
    },
    departures,
    sourceTimestamp: new Date(Math.min(...generated as number[]) * 1000).toISOString(),
    feedTimestamps: Object.fromEntries(feeds.map(({ family, feed }) => [
      family,
      new Date(seconds(feed.header.timestamp)! * 1000).toISOString(),
    ])),
  };
}

export const SUBWAY_FEEDS = {
  numbered: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  ace: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
  bdfm: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  g: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",
  jz: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
  nqrw: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  l: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",
  si: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si",
} as const;

export type FeedFamily = keyof typeof SUBWAY_FEEDS;
export type SubwayFeedSnapshot = { family: FeedFamily; bytes: Uint8Array };
export type SubwayFeedBatch = { feeds: SubwayFeedSnapshot[]; unavailableFamilies: FeedFamily[] };
const TTL_MS = 30_000;
const feedCache = new Map<FeedFamily, { at: number; bytes: Uint8Array }>();
const pendingFeeds = new Map<FeedFamily, Promise<Uint8Array>>();

function validateFeed(bytes: Uint8Array): void {
  const feed = transit_realtime.FeedMessage.decode(bytes);
  const timestamp = seconds(feed.header.timestamp);
  if (!timestamp || !Number.isFinite(timestamp)) throw new Error("Missing MTA feed timestamp");
}

export async function fetchSubwayFeed(family: FeedFamily): Promise<Uint8Array> {
  const now = Date.now();
  const cached = feedCache.get(family);
  if (cached && now - cached.at < TTL_MS) return cached.bytes;
  const pending = pendingFeeds.get(family);
  if (pending) return pending;
  const request = fetch(SUBWAY_FEEDS[family], { cache: "no-store", signal: AbortSignal.timeout(10_000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`MTA ${family} feed returned ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      validateFeed(bytes);
      feedCache.set(family, { at: Date.now(), bytes });
      return bytes;
    })
    .catch((error) => {
      const lastGood = feedCache.get(family);
      if (lastGood) return lastGood.bytes;
      throw error;
    })
    .finally(() => { pendingFeeds.delete(family); });
  pendingFeeds.set(family, request);
  return request;
}

export async function fetchSubwayFeedsForStation(stationId: string): Promise<SubwayFeedBatch> {
  const members = getSubwayStationMembers(stationId);
  if (members.length === 0) throw new Error(`Unknown Subway station: ${stationId}`);
  // A route may be rerouted through a station it does not serve in static
  // metadata, so every family must be available to every station projection.
  const families = Object.keys(SUBWAY_FEEDS) as FeedFamily[];
  const results = await Promise.allSettled(families.map(fetchSubwayFeed));
  const feeds = results.flatMap((result, index) => result.status === "fulfilled"
    ? [{ family: families[index]!, bytes: result.value }]
    : []);
  if (feeds.length === 0) throw results.find((result) => result.status === "rejected")?.reason ?? new Error("No MTA feed available");
  return {
    feeds,
    unavailableFamilies: results.flatMap((result, index) => result.status === "rejected" ? [families[index]!] : []),
  };
}

export const subwayMetadata: SubwayMetadata = {
  stopNames: subwayStopNames,
  headsigns: subwayHeadsigns,
  stations: SUBWAY_STATIONS,
};
