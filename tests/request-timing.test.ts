import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { note, timed, withRequestTiming } = await import("@/lib/requestTiming");

afterEach(() => vi.restoreAllMocks());

describe("request timing", () => {
  it("reports each step and note in Server-Timing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await withRequestTiming("departures", { station: "NY" }, async () => {
      note("cache", "miss");
      await timed("token", async () => "token");
      await timed("njt", () => 1);
      return Response.json({});
    });

    const header = response.headers.get("Server-Timing") ?? "";
    expect(header).toMatch(/^total;dur=[\d.]+, token;dur=[\d.]+, njt;dur=[\d.]+, cache;desc="miss"$/);
  });

  it("adds a repeated step's time to its first", async () => {
    const response = await withRequestTiming("stops", {}, async () => {
      await timed("njt", async () => {});
      await timed("njt", async () => {});
      return Response.json({});
    });
    expect(response.headers.get("Server-Timing")?.match(/njt;/g)).toHaveLength(1);
  });

  it("logs a request that called upstream, with its fields and steps", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await withRequestTiming("departures", { station: "NY" }, async () => {
      note("cache", "miss");
      await timed("njt", async () => {});
      return Response.json({});
    });

    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
      event: "api_timing",
      route: "departures",
      station: "NY",
      status: 200,
      cache: "miss",
      njtMs: expect.any(Number),
    });
  });

  it("does not log a fast request a cache answered", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await withRequestTiming("departures", { station: "NY" }, async () => {
      note("cache", "hit");
      return Response.json({});
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs a failed request even when a cache answered it", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await withRequestTiming("departures", {}, async () => Response.json({}, { status: 502 }));
    expect(log).toHaveBeenCalledOnce();
  });

  it("does nothing outside a timed request", async () => {
    note("cache", "miss");
    await expect(timed("njt", async () => 42)).resolves.toBe(42);
  });
});
