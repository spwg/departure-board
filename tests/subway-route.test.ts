import { afterEach, describe, expect, it, vi } from "vitest";

const decodeSubwayBoard = vi.fn();
const fetchSubwayFeedsForStation = vi.fn();
const getSubwayStation = vi.fn();
vi.mock("@/lib/subway", () => ({
  decodeSubwayBoard,
  fetchSubwayFeedsForStation,
  getSubwayStation,
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
