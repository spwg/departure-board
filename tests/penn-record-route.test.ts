import { afterEach, describe, expect, it, vi } from "vitest";

const getDepartures = vi.fn();
vi.mock("@/lib/departureBoard", () => ({ getDepartures }));
vi.mock("@/lib/pennPositions", () => ({ POSITION_STATION: "NY" }));
afterEach(() => { delete process.env.CRON_SECRET; vi.resetModules(); vi.restoreAllMocks(); });

const call = async (authorization?: string) => {
  const { GET } = await import("@/app/api/penn-positions/record/route");
  return GET(new Request("http://test/api/penn-positions/record", { headers: authorization ? { authorization } : {} }));
};

describe("Penn position recording route", () => {
  it("refuses every call until CRON_SECRET is configured", async () => {
    expect((await call("Bearer anything")).status).toBe(503);
    expect(getDepartures).not.toHaveBeenCalled();
  });

  it("rejects a wrong or missing secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect(getDepartures).not.toHaveBeenCalled();
  });

  it("loads the New York Penn board, which records history, and reports what it saw", async () => {
    process.env.CRON_SECRET = "s3cret";
    getDepartures.mockResolvedValue([{ id: "a", position: {} }, { id: "b" }]);
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ departures: 2, positioned: 1 });
    expect(getDepartures).toHaveBeenCalledWith("NY");
  });

  it("reports an upstream failure as 502", async () => {
    process.env.CRON_SECRET = "s3cret"; vi.spyOn(console, "error").mockImplementation(() => {});
    getDepartures.mockRejectedValue(new Error("down"));
    expect((await call("Bearer s3cret")).status).toBe(502);
  });
});
