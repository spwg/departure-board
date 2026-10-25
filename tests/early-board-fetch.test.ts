import { afterEach, describe, expect, it, vi } from "vitest";
import { startEarlyBoardFetch, takeEarlyBoardFetch } from "@/lib/earlyBoardFetch";

afterEach(() => vi.unstubAllGlobals());

describe("early board fetch", () => {
  it("requests an NJ Transit board's departures and hands the response out once", async () => {
    const response = new Response("{}");
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetch);

    startEarlyBoardFetch("/station/NY");
    expect(fetch).toHaveBeenCalledWith("/api/departures/NY", { cache: "no-store" });
    await expect(takeEarlyBoardFetch("/api/departures/NY")).resolves.toBe(response);
    expect(takeEarlyBoardFetch("/api/departures/NY")).toBeNull();
  });

  it("asks for the canonical station code the board will ask for", () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);

    startEarlyBoardFetch("/station/ny");
    expect(takeEarlyBoardFetch("/api/departures/NY")).not.toBeNull();
  });

  it("requests a Subway board exactly as the station page's board does", () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);

    startEarlyBoardFetch("/subway/station/128");
    expect(fetch).toHaveBeenCalledWith("/api/subway/departures/128?exact=true", { cache: "no-store" });
    expect(takeEarlyBoardFetch("/api/subway/departures/128")).toBeNull();
    expect(takeEarlyBoardFetch("/api/subway/departures/128?exact=true")).not.toBeNull();
  });

  it("requests nothing for pages without a board", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    for (const path of ["/", "/settings", "/station/NY/status", "/subway/station/128/N"]) {
      startEarlyBoardFetch(path);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
