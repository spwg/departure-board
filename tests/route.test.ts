import { afterEach, describe, expect, it, vi } from "vitest";

const fetchDepartures = vi.fn(); const normalizeDepartures = vi.fn(); const getStation = vi.fn(); const usingFixtures = vi.fn(); const revalidateTag = vi.fn(); const invalidateToken = vi.fn();
class InvalidTokenError extends Error { constructor(readonly token = "rejected-token") { super(); } }
vi.mock("@/lib/njtClient", () => ({ fetchDepartures, invalidateToken, usingFixtures, InvalidTokenError, TOKEN_TAG: "njt-token" }));
vi.mock("@/lib/departures", () => ({ normalizeDepartures })); vi.mock("@/lib/stations", () => ({ getStation })); vi.mock("next/cache", () => ({ revalidateTag }));
afterEach(() => { vi.clearAllMocks(); vi.resetModules(); });
const context = (code: string) => ({ params: Promise.resolve({ code }) }) as never;

describe("departures route contract", () => {
  it("returns 404 for an unknown station", async () => {
    getStation.mockReturnValue(undefined); const { GET } = await import("@/app/api/departures/[code]/route"); const response = await GET(new Request("http://test"), context("NO")); expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "Unknown station code: NO" });
  });
  it("normalizes a known station and prevents HTTP caching", async () => {
    getStation.mockReturnValue({ code: "NY", name: "New York Penn Station" }); fetchDepartures.mockResolvedValue([{ raw: true }]); normalizeDepartures.mockReturnValue([{ id: "one" }]); usingFixtures.mockReturnValue(true);
    const { GET } = await import("@/app/api/departures/[code]/route"); const response = await GET(new Request("http://test"), context("ny")); const body = await response.json();
    expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(body).toMatchObject({ station: { code: "NY", name: "New York Penn Station" }, departures: [{ id: "one" }], fixtures: true });
  });
  it("refreshes a rejected token once and turns unrecoverable failures into 502", async () => {
    getStation.mockReturnValue({ code: "NY", name: "New York Penn Station" }); fetchDepartures.mockRejectedValueOnce(new InvalidTokenError()).mockResolvedValueOnce([]); normalizeDepartures.mockReturnValue([]); usingFixtures.mockReturnValue(false);
    const { GET } = await import("@/app/api/departures/[code]/route"); expect((await GET(new Request("http://test"), context("NY"))).status).toBe(200); expect(invalidateToken).toHaveBeenCalledWith("rejected-token"); expect(revalidateTag).toHaveBeenCalledWith("njt-token", { expire: 0 });
    getStation.mockReturnValue({ code: "NW", name: "Newark" }); fetchDepartures.mockRejectedValueOnce(new Error("down")); vi.spyOn(console, "error").mockImplementation(() => {}); expect((await GET(new Request("http://test"), context("NW"))).status).toBe(502);
  });
});
