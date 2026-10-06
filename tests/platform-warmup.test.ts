import { afterEach, describe, expect, it, vi } from "vitest";
import { getBoardListing } from "@/lib/boardDirectory";
import { njtBoardChoice, subwayBoardChoice } from "@/lib/boardChoices";
import {
  boardsToWarm,
  boardWarmUrls,
  resetWarmedBoards,
  WARM_LIMIT,
  WARM_MAX_DISTANCE_KM,
  warmBoards,
} from "@/lib/platformWarmup";
import { distanceKm } from "@/lib/stations";

const PENN = { latitude: 40.750569, longitude: -73.993519 };

function stubController() {
  const postMessage = vi.fn();
  Object.defineProperty(navigator, "serviceWorker", {
    value: { controller: { postMessage } },
    configurable: true,
  });
  return postMessage;
}

afterEach(() => {
  resetWarmedBoards();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("fetching nearby boards ahead", () => {
  it("requests the same URLs each board's own route requests", () => {
    expect(boardWarmUrls(getBoardListing(njtBoardChoice("NY"))!))
      .toEqual(["/station/NY", "/api/departures/NY"]);
    const subway = getBoardListing(subwayBoardChoice("A28"))!;
    expect(boardWarmUrls(subway))
      .toEqual([subway.href, "/api/subway/departures/A28?exact=true"]);
  });

  it("picks only the closest few boards within a short walk", () => {
    const boards = boardsToWarm(PENN);
    expect(boards.length).toBeGreaterThan(0);
    expect(boards.length).toBeLessThanOrEqual(WARM_LIMIT);
    expect(boards.map((listing) => listing.choice)).toContainEqual(njtBoardChoice("NY"));
    for (const listing of boards) {
      expect(distanceKm(PENN.latitude, PENN.longitude, listing.latitude, listing.longitude))
        .toBeLessThanOrEqual(WARM_MAX_DISTANCE_KM);
    }
    // Middle of the Atlantic: nothing is a walk away.
    expect(boardsToWarm({ latitude: 39, longitude: -70 })).toEqual([]);
  });

  it("hands the URLs to the service worker and skips boards fetched moments ago", () => {
    const postMessage = stubController();
    const penn = getBoardListing(njtBoardChoice("NY"))!;

    expect(warmBoards([penn], 0)).toEqual(["/station/NY", "/api/departures/NY"]);
    expect(postMessage).toHaveBeenCalledWith({
      type: "warm-boards",
      urls: ["/station/NY", "/api/departures/NY"],
    });

    expect(warmBoards([penn], 60_000)).toEqual([]);
    expect(postMessage).toHaveBeenCalledTimes(1);

    expect(warmBoards([penn], 2 * 60_000)).toHaveLength(2);
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it("does nothing until a service worker controls the page", () => {
    expect(warmBoards([getBoardListing(njtBoardChoice("NY"))!])).toEqual([]);
  });
});
