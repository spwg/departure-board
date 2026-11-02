import subwayStations from "./subway-stations.json";

/**
 * The parts of the Subway model that client components need: the station
 * directory and route colours. Kept apart from lib/subway, which decodes MTA's
 * protobuf feeds, so the browser never downloads the GTFS-Realtime bindings or
 * the headsign and stop-name tables.
 */

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

const ROUTE_COLORS: Record<string, string> = {
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
  "4": "#00933C", "5": "#00933C", "6": "#00933C", "6X": "#00933C",
  "7": "#B933AD", "7X": "#B933AD",
  A: "#0039A6", C: "#0039A6", E: "#0039A6",
  B: "#FF6319", D: "#FF6319", F: "#FF6319", FX: "#FF6319", M: "#FF6319",
  G: "#6CBE45", J: "#996633", Z: "#996633", L: "#A7A9AC",
  N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A",
  S: "#808183", FS: "#808183", GS: "#808183", H: "#808183",
  SI: "#0039A6", SIR: "#0039A6",
};

export function subwayRouteColor(route: string): string {
  return ROUTE_COLORS[route] ?? "#808183";
}

/** Whether a route id is one of MTA's Subway routes. */
export function isSubwayRoute(route: string): boolean {
  return Object.hasOwn(ROUTE_COLORS, route);
}

export function getSubwayStation(stationId: string): SubwayStation | undefined {
  return SUBWAY_STATIONS.find((station) => station.id === stationId);
}
