import { describe, expect, it } from "vitest";
import { njtBoardChoice, subwayBoardChoice } from "@/lib/boardChoices";
import {
  boardListings,
  boardListingsByLetter,
  getBoardListing,
  nearestBoardListing,
  searchBoardListings,
} from "@/lib/boardDirectory";
import { stations } from "@/lib/stations";
import { SUBWAY_STATIONS } from "@/lib/subway";

describe("combined board directory", () => {
  it("offers every NJT station and every Subway complex as one board choice each", () => {
    const complexes = new Set(SUBWAY_STATIONS.map((station) => station.complexId));
    expect(boardListings.filter((listing) => listing.system === "NJT")).toHaveLength(stations.length);
    expect(boardListings.filter((listing) => listing.system === "Subway")).toHaveLength(complexes.size);

    // One entry per complex, not per platform: the members share a board.
    const timesSquare = boardListings.filter((listing) => listing.name === "Times Sq-42 St");
    expect(timesSquare).toHaveLength(1);
    expect(timesSquare[0]!.routes).toEqual(expect.arrayContaining(["1", "7", "A", "N", "S"]));
  });

  it("searches both systems in one ranked result set, including a complex's other names", () => {
    expect(searchBoardListings("ny")[0]).toMatchObject({ name: "New York Penn Station", system: "NJT" });
    expect(searchBoardListings("times sq")[0]).toMatchObject({ name: "Times Sq-42 St", system: "Subway" });
    // A rider who knows the place as World Trade Center still finds its board.
    expect(searchBoardListings("world trade")[0]).toMatchObject({
      name: "Park Place",
      alsoKnownAs: expect.arrayContaining(["World Trade Center"]),
    });
    expect(searchBoardListings("")).toEqual([]);
  });

  it("distinguishes repeated Subway names by their provider-native routes", () => {
    const eightySixth = searchBoardListings("86 st", 20).filter((listing) => listing.name === "86 St");
    expect(eightySixth.length).toBeGreaterThan(3);
    const routeSets = eightySixth.map((listing) => listing.routes.join(","));
    expect(new Set(routeSets).size).toBe(routeSets.length);
  });

  it("resolves saved choices across both systems and both storage generations", () => {
    expect(getBoardListing(njtBoardChoice("NY"))?.href).toBe("/station/NY");
    // A Subway complex member saved before it was folded under its complex's
    // title still opens the board it always opened.
    expect(getBoardListing(subwayBoardChoice("128"))?.href).toBe("/subway/station/128");
    expect(getBoardListing(subwayBoardChoice("no-such-stop"))).toBeNull();
  });

  it("compares both systems when choosing the nearest board", () => {
    const penn = nearestBoardListing(40.750569, -73.993519);
    expect(penn.listing.choice).toEqual(njtBoardChoice("NY"));
    expect(penn.distanceKm).toBeLessThan(0.05);

    const unionSquare = nearestBoardListing(40.7359, -73.9906);
    expect(unionSquare.listing.system).toBe("Subway");
  });

  it("groups the whole directory alphabetically without dropping a listing", () => {
    const grouped = boardListingsByLetter();
    expect(grouped.flatMap(([, group]) => group)).toHaveLength(boardListings.length);
    expect(grouped.map(([letter]) => letter)).toEqual([...grouped.map(([letter]) => letter)].sort());
  });
});
