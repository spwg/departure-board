import { afterEach, describe, expect, it, vi } from "vitest";

const decodeSubwayBoard = vi.fn();
const decodeSubwayTrip = vi.fn();
const fetchSubwayFeed = vi.fn();
const fetchSubwayFeedsForStation = vi.fn();
const getSubwayStation = vi.fn();
const parseSubwayDepartureId = vi.fn();
vi.mock("@/lib/subway", () => ({
  decodeSubwayBoard,
  decodeSubwayTrip,
  fetchSubwayFeed,
  fetchSubwayFeedsForStation,
  getSubwayStation,
  parseSubwayDepartureId,
  subwayMetadata: { stations: [], stopNames: {} },
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

const context = (stationId: string) => ({ params: Promise.resolve({ stationId }) }) as never;

describe("Subway departures route contract", () => {
  it("rejects unknown provider station identities", async () => {
    getSubwayStation.mockReturnValue(undefined);
    const { GET } = await import("@/app/api/subway/departures/[stationId]/route");
    const response = await GET(new Request("http://test"), context("unknown"));
    expect(response.status).toBe(404);
  });

  it("returns a realtime-only board without browser caching", async () => {
    getSubwayStation.mockReturnValue({ id: "R20" });
    fetchSubwayFeedsForStation.mockResolvedValue({ feeds: [{ family: "nqrw", bytes: Uint8Array.of(1) }], unavailableFamilies: ["l"] });
    decodeSubwayBoard.mockReturnValue({
      station: { id: "R20" },
      departures: [{ id: "mta:nqrw:n:R20", route: "N", direction: "Uptown", destination: "Astoria-Ditmars Blvd", nextStop: "49 St", expectedTime: "2026-08-04T12:05:00.000Z", stationId: "R20" }],
      sourceTimestamp: "2026-08-04T12:00:00.000Z",
    });
    const { GET } = await import("@/app/api/subway/departures/[stationId]/route");
    const response = await GET(new Request("http://test"), context("R20"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchSubwayFeedsForStation).toHaveBeenCalledWith("R20");
    const body = await response.json();
    expect(body.unavailableFeedFamilies).toEqual(["l"]);
    expect(body.departures[0]).toMatchObject({ route: "N", destination: "Astoria-Ditmars Blvd", nextStop: "49 St" });
  });

  it("reports an unavailable board only when no relevant feed family is usable", async () => {
    getSubwayStation.mockReturnValue({ id: "R20" });
    fetchSubwayFeedsForStation.mockRejectedValue(new Error("all feeds failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/subway/departures/[stationId]/route");
    expect((await GET(new Request("http://test"), context("R20"))).status).toBe(502);
  });
});

const tripContext = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describe("Subway trip route contract", () => {
  it("serves one exact trip's remaining route from its own feed family", async () => {
    parseSubwayDepartureId.mockReturnValue({ family: "nqrw", tripId: "n-trip", stationId: "R20" });
    fetchSubwayFeed.mockResolvedValue(Uint8Array.of(1));
    decodeSubwayTrip.mockReturnValue({
      id: "mta:nqrw:n-trip:R20", route: "N", direction: "Uptown", destination: "Astoria-Ditmars Blvd",
      stops: [{ id: "R20", name: "14 St-Union Sq", time: "2026-08-04T12:05:00.000Z" }],
      sourceTimestamp: "2026-08-04T12:00:00.000Z",
    });

    const { GET } = await import("@/app/api/subway/trips/[id]/route");
    const response = await GET(new Request("http://test"), tripContext(encodeURIComponent("mta:nqrw:n-trip:R20")));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    // Only the one bundle the identity names, not every family.
    expect(fetchSubwayFeed).toHaveBeenCalledWith("nqrw");
    expect(await response.json()).toMatchObject({ route: "N", stops: [{ name: "14 St-Union Sq" }] });
  });

  it("answers 404 for a malformed identity and for a trip MTA no longer publishes", async () => {
    parseSubwayDepartureId.mockReturnValue(null);
    const { GET } = await import("@/app/api/subway/trips/[id]/route");
    expect((await GET(new Request("http://test"), tripContext("nonsense"))).status).toBe(404);

    parseSubwayDepartureId.mockReturnValue({ family: "nqrw", tripId: "finished", stationId: "R20" });
    fetchSubwayFeed.mockResolvedValue(Uint8Array.of(1));
    decodeSubwayTrip.mockReturnValue(null);
    expect((await GET(new Request("http://test"), tripContext("mta:nqrw:finished:R20"))).status).toBe(404);
  });

  it("turns an upstream feed failure into an explicit 502", async () => {
    parseSubwayDepartureId.mockReturnValue({ family: "nqrw", tripId: "n-trip", stationId: "R20" });
    fetchSubwayFeed.mockRejectedValue(new Error("feed unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/subway/trips/[id]/route");
    expect((await GET(new Request("http://test"), tripContext("mta:nqrw:n-trip:R20"))).status).toBe(502);
  });
});
