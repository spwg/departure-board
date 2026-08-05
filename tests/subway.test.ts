import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { transit_realtime } from "gtfs-realtime-bindings";
import { decodeSubwayBoard, subwayMetadata } from "@/lib/subway";

function fixture() {
  return transit_realtime.FeedMessage.encode({
    header: { gtfsRealtimeVersion: "2.0", timestamp: 1_786_000_000 },
    entity: [
      {
        id: "uptown",
        tripUpdate: {
          trip: { tripId: "trip-1", routeId: "1" },
          stopTimeUpdate: [
            { stopId: "127N", departure: { time: 1_786_000_300 } },
            { stopId: "101N", arrival: { time: 1_786_001_000 } },
          ],
        },
      },
      {
        id: "headsign",
        tripUpdate: {
          trip: { tripId: "trip-2", routeId: "2" },
          stopTimeUpdate: [
            { stopId: "127S", departure: { time: 1_786_000_200 } },
            { stopId: "247S", arrival: { time: 1_786_001_000 } },
          ],
        },
      },
      {
        id: "terminal-arrival",
        tripUpdate: {
          trip: { tripId: "trip-3", routeId: "3" },
          stopTimeUpdate: [{ stopId: "127S", arrival: { time: 1_786_000_100 } }],
        },
      },
      {
        id: "nonterminal-arrival-only",
        tripUpdate: {
          trip: { tripId: "trip-4", routeId: "3" },
          stopTimeUpdate: [
            { stopId: "127N", arrival: { time: 1_786_000_400 } },
            { stopId: "301N", arrival: { time: 1_786_001_000 } },
          ],
        },
      },
    ],
  }).finish();
}

describe("MTA realtime board contract", () => {
  it("decodes a captured official Penn feed against captured official station metadata", () => {
    const board = decodeSubwayBoard(readFileSync("tests/fixtures/mta-123.pb"), subwayMetadata);
    expect(Date.parse(board.sourceTimestamp)).toBeGreaterThan(0);
    expect(board.departures.length).toBeGreaterThan(0);
    expect(board.departures.every((departure) => ["1", "2", "3"].includes(departure.route))).toBe(true);
  });

  it("decodes directions, uses reliable headsigns then final live stops, and excludes terminal arrivals", () => {
    const board = decodeSubwayBoard(fixture(), {
      stopNames: { "101": "Van Cortlandt Park-242 St", "247": "Flatbush Av-Brooklyn College", "301": "Harlem-148 St" },
      headsigns: { "trip-2": "Brooklyn College-Flatbush Av" },
    });

    expect(board.sourceTimestamp).toBe("2026-08-06T07:06:40.000Z");
    expect(board.departures).toEqual([
      expect.objectContaining({ route: "2", direction: "Downtown", destination: "Brooklyn College-Flatbush Av" }),
      expect.objectContaining({ route: "1", direction: "Uptown", destination: "Van Cortlandt Park-242 St" }),
      expect.objectContaining({ route: "3", direction: "Uptown", destination: "Harlem-148 St" }),
    ]);
  });

  it("rejects malformed protobuf and a missing source timestamp", () => {
    expect(() => decodeSubwayBoard(Uint8Array.of(255), { stopNames: {} })).toThrow();
    const noTimestamp = transit_realtime.FeedMessage.encode({ header: { gtfsRealtimeVersion: "2.0" }, entity: [] }).finish();
    expect(() => decodeSubwayBoard(noTimestamp, { stopNames: {} })).toThrow("timestamp");
  });
});
