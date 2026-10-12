import { afterEach, describe, expect, it, vi } from "vitest";
import { getBoardListing } from "@/lib/boardDirectory";
import { njtBoardChoice, subwayBoardChoice } from "@/lib/boardChoices";
import {
  boardsToWarm,
  boardWarmUrls,
  resetWarmedBoards,
  WARM_FAVORITES,
  WARM_NEAREST,
  warmBoards,
} from "@/lib/platformWarmup";

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

  it("picks the closest few boards however far away they are", () => {
    const boards = boardsToWarm(PENN);
    expect(boards).toHaveLength(WARM_NEAREST);
    expect(boards.map((listing) => listing.choice)).toContainEqual(njtBoardChoice("NY"));
    // Middle of the Atlantic: the nearest boards are still worth having.
    expect(boardsToWarm({ latitude: 39, longitude: -70 })).toHaveLength(WARM_NEAREST);
  });

  it("adds favorites after the nearest boards, each board once, even without a location", () => {
    const penn = getBoardListing(njtBoardChoice("NY"))!;
    const hoboken = getBoardListing(njtBoardChoice("HB"))!;
    // Upper West Side: the nearest boards are all subway stops.
    const uws = boardsToWarm({ latitude: 40.7835, longitude: -73.9785 }, [penn, hoboken]);
    expect(uws).toHaveLength(WARM_NEAREST + 2);
    expect(uws.slice(-2)).toEqual([penn, hoboken]);

    // Standing at Penn, the favorite is already among the nearest.
    const atPenn = boardsToWarm(PENN, [penn]);
    expect(atPenn.filter((listing) => listing === penn)).toHaveLength(1);

    expect(boardsToWarm(null, [penn, hoboken])).toEqual([penn, hoboken]);
    const many = Array.from({ length: WARM_FAVORITES + 2 }, (_, i) => uws[i % 3]!);
    expect(boardsToWarm(null, [penn, hoboken, ...many]).length).toBeLessThanOrEqual(WARM_FAVORITES);
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
