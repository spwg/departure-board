import subwayStations from "./subway-stations.json";

/**
 * The Subway station directory, without lib/subway's feed decoder, for client
 * code that searches or links stations.
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

export function getSubwayStation(stationId: string): SubwayStation | undefined {
  return SUBWAY_STATIONS.find((station) => station.id === stationId);
}
