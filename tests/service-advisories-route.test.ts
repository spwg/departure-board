import { afterEach, describe, expect, it, vi } from "vitest";

const getServiceAdvisorySnapshot = vi.fn();
const getStation = vi.fn();
vi.mock("@/lib/serviceAdvisorySource", () => ({ getServiceAdvisorySnapshot }));
vi.mock("@/lib/stations", () => ({ getStation }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("service-advisories route contract", () => {
  it("asks the server source for a station context and prevents browser caching", async () => {
    getStation.mockReturnValue({ code: "NY", name: "New York Penn Station", lines: ["NE"] });
    getServiceAdvisorySnapshot.mockResolvedValue({
      advisories: [{ id: "notice" }],
      authoritativeRevisions: { notice: "official-revision" },
    });
    const { GET } = await import("@/app/api/service-advisories/route");

    const response = await GET(new Request("http://test/api/service-advisories?station=ny"));
    expect(getServiceAdvisorySnapshot).toHaveBeenCalledWith({
      station: { code: "NY", name: "New York Penn Station", lines: ["NE"] },
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      advisories: [{ id: "notice" }],
      authoritativeRevisions: { notice: "official-revision" },
    });
  });

  it("uses line-only context for train pages and degrades an RSS failure to 502", async () => {
    getStation.mockReturnValue(undefined);
    getServiceAdvisorySnapshot
      .mockResolvedValueOnce({ advisories: [], authoritativeRevisions: {} })
      .mockRejectedValueOnce(new Error("offline"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/service-advisories/route");

    expect((await GET(new Request("http://test/api/service-advisories?line=ne"))).status).toBe(200);
    expect(getServiceAdvisorySnapshot).toHaveBeenCalledWith({ lineCodes: ["NE"] });
    expect((await GET(new Request("http://test/api/service-advisories?line=NE"))).status).toBe(502);
    error.mockRestore();
  });
});
