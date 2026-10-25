/**
 * Subway route identities, free of feed decoding and station data so client
 * components can import them without shipping lib/subway's protobuf decoder.
 */

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
