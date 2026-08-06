import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { transit_realtime } from "gtfs-realtime-bindings";
import {
  decodeSubwayBoard,
  decodeSubwayTrip,
  getSubwayStation,
  fetchSubwayFeedsForStation,
  parseSubwayDepartureId,
  subwayMetadata,
  subwayRouteColor,
  type FeedFamily,
} from "@/lib/subway";

const snapshot = (bytes: Uint8Array, family: FeedFamily = "numbered") => ({ family, bytes });

function fixture() {
  return transit_realtime.FeedMessage.encode({
    header: { gtfsRealtimeVersion: "2.0", timestamp: 1_786_000_000 },
    entity: [
      {
        id: "uptown",
        tripUpdate: {
          trip: { tripId: "trip-1", routeId: "1" },
          stopTimeUpdate: [
            { stopId: "128N", departure: { time: 1_786_000_300 } },
            { stopId: "101N", arrival: { time: 1_786_001_000 } },
          ],
        },
      },
      {
        id: "headsign",
        tripUpdate: {
          trip: { tripId: "trip-2", routeId: "2" },
          stopTimeUpdate: [
            { stopId: "128S", departure: { time: 1_786_000_200 } },
            { stopId: "247S", arrival: { time: 1_786_001_000 } },
          ],
        },
      },
      {
        id: "terminal-arrival",
        tripUpdate: {
          trip: { tripId: "trip-3", routeId: "3" },
          stopTimeUpdate: [{ stopId: "128S", arrival: { time: 1_786_000_100 } }],
        },
      },
      {
        // Express: its following call is several stations up the line.
        id: "nonterminal-arrival-only",
        tripUpdate: {
          trip: { tripId: "trip-4", routeId: "3" },
          stopTimeUpdate: [
            { stopId: "128N", arrival: { time: 1_786_000_400 } },
            { stopId: "120N", arrival: { time: 1_786_000_700 } },
            { stopId: "301N", arrival: { time: 1_786_001_000 } },
          ],
        },
      },
    ],
  }).finish();
}

describe("MTA realtime board contract", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("decodes a captured official numbered-line feed against official station metadata", () => {
    const board = decodeSubwayBoard([snapshot(readFileSync("tests/fixtures/mta-123.pb"))], "127", subwayMetadata);
    expect(Date.parse(board.sourceTimestamp)).toBeGreaterThan(0);
    expect(board.departures.length).toBeGreaterThan(0);
    expect(board.departures.every((departure) => ["1", "2", "3"].includes(departure.route))).toBe(true);
  });

  it("decodes directions and next stops, uses reliable headsigns then final live stops, and excludes terminal arrivals", () => {
    const board = decodeSubwayBoard([snapshot(fixture())], "128", {
      stopNames: { "101": "Van Cortlandt Park-242 St", "120": "96 St", "247": "Flatbush Av-Brooklyn College", "301": "Harlem-148 St" },
      headsigns: { "trip-2": "Brooklyn College-Flatbush Av" },
      stations: [{ id: "128", name: "34 St-Penn Station", complexId: "318", routes: ["1", "2", "3"], latitude: 40.750373, longitude: -73.991057, directions: { N: "Uptown", S: "Downtown" } }],
    });

    expect(board.sourceTimestamp).toBe("2026-08-06T07:06:40.000Z");
    expect(board.departures).toEqual([
      // An ordinary departure: its next stop is the very next station.
      expect.objectContaining({ route: "2", direction: "Downtown", destination: "Brooklyn College-Flatbush Av", nextStop: "Flatbush Av-Brooklyn College", destinationId: "mta:headsign:brooklyn college-flatbush av" }),
      expect.objectContaining({ route: "1", direction: "Uptown", destination: "Van Cortlandt Park-242 St", nextStop: "Van Cortlandt Park-242 St" }),
      // Running ahead: the next stop it makes is several stations up the line,
      // which is how a rider sees it will pass their station without anyone
      // classifying the train as express.
      expect.objectContaining({ route: "3", direction: "Uptown", destination: "Harlem-148 St", nextStop: "96 St" }),
    ]);
    // The terminal arrival has no later stop, so it is not a departure at all —
    // which is what makes next stop structurally guaranteed on every row.
    expect(board.departures.every((departure) => departure.nextStop)).toBe(true);
    expect(board.departures.some((departure) => departure.id.includes("trip-3"))).toBe(false);
  });

  it("rejects malformed protobuf and a missing source timestamp", () => {
    const metadata = { stopNames: {}, stations: [{ id: "128", name: "Penn", complexId: "318", routes: ["1"], latitude: 0, longitude: 0, directions: { N: "Uptown", S: "Downtown" } }] };
    expect(() => decodeSubwayBoard([snapshot(Uint8Array.of(255))], "128", metadata)).toThrow();
    const noTimestamp = transit_realtime.FeedMessage.encode({ header: { gtfsRealtimeVersion: "2.0" }, entity: [] }).finish();
    expect(() => decodeSubwayBoard([snapshot(noTimestamp)], "128", metadata)).toThrow("timestamp");
  });

  it("covers official stations and groups complex members only by matching published labels", () => {
    expect(getSubwayStation("128")?.name).toBe("34 St-Penn Station");
    expect(getSubwayStation("127")?.name).toBe("Times Sq-42 St");
    expect(subwayMetadata.stations.length).toBeGreaterThan(450);

    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_786_000_000 },
      entity: [
        { id: "broadway", tripUpdate: { trip: { tripId: "n", routeId: "N" }, stopTimeUpdate: [{ stopId: "R20N", departure: { time: 1_786_000_100 } }, { stopId: "R01N", arrival: { time: 1_786_001_000 } }] } },
        { id: "lex", tripUpdate: { trip: { tripId: "4", routeId: "4" }, stopTimeUpdate: [{ stopId: "635N", departure: { time: 1_786_000_200 } }, { stopId: "401N", arrival: { time: 1_786_001_000 } }] } },
        { id: "canarsie", tripUpdate: { trip: { tripId: "l", routeId: "L" }, stopTimeUpdate: [{ stopId: "L03N", departure: { time: 1_786_000_300 } }, { stopId: "L01N", arrival: { time: 1_786_001_000 } }] } },
      ],
    }).finish();
    const board = decodeSubwayBoard([snapshot(feed, "nqrw")], "R20", subwayMetadata);
    expect(board.station.memberIds).toEqual(expect.arrayContaining(["R20", "635", "L03"]));
    expect(board.departures.map(({ route, direction }) => [route, direction])).toEqual([
      ["N", "Uptown"], ["4", "Uptown"], ["L", "West Side"],
    ]);
  });

  it("projects captured Times Square feed families through their actual complex members", () => {
    const board = decodeSubwayBoard([
      snapshot(readFileSync("tests/fixtures/mta-123.pb"), "numbered"),
      snapshot(readFileSync("tests/fixtures/mta-nqrw.pb"), "nqrw"),
    ], "127", subwayMetadata);

    expect(board.station.name).toBe("Times Sq-42 St");
    expect(board.station.memberIds).toEqual(expect.arrayContaining(["127", "R16", "725", "902"]));
    expect(board.departures.some((departure) => departure.stationId === "127")).toBe(true);
    expect(board.feedTimestamps.nqrw).toBeTruthy();
  });

  it("uses provider-native destinations when a station direction label is absent", () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_786_000_000 },
      entity: [{ id: "terminal", tripUpdate: { trip: { tripId: "r", routeId: "R" }, stopTimeUpdate: [{ stopId: "R01S", departure: { time: 1_786_000_100 } }, { stopId: "R27S", arrival: { time: 1_786_001_000 } }] } }],
    }).finish();
    const station = getSubwayStation("R01")!;
    const board = decodeSubwayBoard([snapshot(feed, "nqrw")], "R01", {
      ...subwayMetadata,
      stations: [{ ...station, directions: {} }],
    });
    expect(board.departures[0]?.direction).toBe(board.departures[0]?.destination);
  });

  it("opens one exact trip's remaining route and refuses identities MTA no longer publishes", () => {
    const metadata = {
      stopNames: { "101": "Van Cortlandt Park-242 St", "120": "96 St", "128": "34 St-Penn Station", "247": "Flatbush Av-Brooklyn College", "301": "Harlem-148 St" },
      headsigns: { "trip-2": "Brooklyn College-Flatbush Av" },
      stations: [{ id: "128", name: "34 St-Penn Station", complexId: "318", routes: ["1", "2", "3"], latitude: 40.750373, longitude: -73.991057, directions: { N: "Uptown", S: "Downtown" } }],
    };
    const feeds = [snapshot(fixture())];

    expect(parseSubwayDepartureId("mta:numbered:trip-1:128")).toEqual({ family: "numbered", tripId: "trip-1", stationId: "128" });
    expect(parseSubwayDepartureId("mta:nosuchfeed:trip-1:128")).toBeNull();
    expect(parseSubwayDepartureId("trip-1")).toBeNull();

    const trip = decodeSubwayTrip(feeds, "mta:numbered:trip-1:128", metadata)!;
    expect(trip).toMatchObject({ route: "1", direction: "Uptown", destination: "Van Cortlandt Park-242 St" });
    // Only the calls the train has still to make — the feed drops the rest,
    // and nothing reconstructs them.
    expect(trip.stops).toEqual([
      { id: "128", name: "34 St-Penn Station", time: "2026-08-06T07:11:40.000Z" },
      { id: "101", name: "Van Cortlandt Park-242 St", time: "2026-08-06T07:23:20.000Z" },
    ]);
    expect(trip.sourceTimestamp).toBe("2026-08-06T07:06:40.000Z");

    // A reliably joined headsign still wins over the final remaining stop.
    expect(decodeSubwayTrip(feeds, "mta:numbered:trip-2:128", metadata)?.destination)
      .toBe("Brooklyn College-Flatbush Av");

    // Finished, unknown, or wrong-family identities are simply not there.
    expect(decodeSubwayTrip(feeds, "mta:numbered:trip-gone:128", metadata)).toBeNull();
    expect(decodeSubwayTrip(feeds, "mta:ace:trip-1:128", metadata)).toBeNull();
  });

  it("provides official route colors across every feed family", () => {
    expect(subwayRouteColor("A")).toBe("#0039A6");
    expect(subwayRouteColor("G")).toBe("#6CBE45");
    expect(subwayRouteColor("N")).toBe("#FCCC0A");
    expect(subwayRouteColor("S")).toBe("#808183");
  });

  it("keeps a failed feed family from blanking other members of a station complex", async () => {
    const bytes = fixture();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("gtfs-l") || url.endsWith("gtfs-bdfm")) throw new Error("feed unavailable");
      return new Response(Uint8Array.from(bytes).buffer);
    });
    vi.stubGlobal("fetch", fetchMock);

    const batch = await fetchSubwayFeedsForStation("R20");
    expect(batch.feeds).toHaveLength(6);
    expect(batch.unavailableFamilies).toEqual(["bdfm", "l"]);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("retains cross-family reroutes without filtering on assignment or movement confidence", () => {
    const feed = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_786_000_000 },
      entity: [{ id: "reroute", tripUpdate: { trip: { tripId: "f-reroute", routeId: "F" }, stopTimeUpdate: [{ stopId: "A28N", departure: { time: 1_786_000_100 } }, { stopId: "D13N", arrival: { time: 1_786_001_000 } }] } }],
    }).finish();
    const board = decodeSubwayBoard([snapshot(feed, "bdfm")], "A28", subwayMetadata);
    expect(board.departures[0]).toMatchObject({ id: "mta:bdfm:f-reroute:A28", route: "F", direction: "Uptown" });
    expect(board.feedTimestamps.bdfm).toBe(board.sourceTimestamp);
  });
});
