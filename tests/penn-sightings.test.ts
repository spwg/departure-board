import { afterEach, describe, expect, it, vi } from "vitest";
import type { Departure } from "@/lib/departures";

const redisCommand = vi.fn(); const usingFixtures = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/njtTokenStore", () => ({ redisCommand }));
vi.mock("@/lib/njtClient", () => ({ usingFixtures }));
afterEach(() => { vi.resetModules(); });

const base: Departure = { id: "x", destination: "Trenton", scheduledTime: "2024-05-30T15:00:00.000Z", expectedTime: "2024-05-30T15:00:00.000Z", trainNumber: "1", line: "Northeast Corridor Line", lineCode: "NE", track: "", status: "on-time", statusText: "", delayMinutes: 0 };

describe("Penn sighted tracks", () => {
  it("learns a posted train's circuit once and sights an unposted train on a learned platform", async () => {
    usingFixtures.mockReturnValue(false);
    redisCommand.mockImplementation(async (command: string) => command === "HGETALL" ? ["P9\t9", "20"] : 1);
    const { addSightedTracks } = await import("@/lib/pennSightings");
    const departures = [{ ...base, trainNumber: "1" }, { ...base, trainNumber: "2", track: "5" }];
    const vehicles = async () => [{ ID: "1", ICS_TRACK_CKT: "P9" }, { ID: "2", ICS_TRACK_CKT: "P5" }];

    const result = await addSightedTracks(departures, vehicles);
    await addSightedTracks(departures, vehicles);

    expect(result[0].sightedTrack).toBe("9"); expect(result[1].sightedTrack).toBeUndefined();
    const evals = redisCommand.mock.calls.filter(([command]) => command === "EVAL");
    expect(evals).toHaveLength(1); expect(evals[0]).toContain("P5\t5");
  });

  it("returns the board unchanged when vehicle data fails", async () => {
    usingFixtures.mockReturnValue(false); vi.spyOn(console, "error").mockImplementation(() => {});
    const { addSightedTracks } = await import("@/lib/pennSightings");
    const departures = [base];
    expect(await addSightedTracks(departures, async () => { throw new Error("down"); })).toBe(departures);
  });

  it("uses the canned table instead of Redis for fixtures", async () => {
    usingFixtures.mockReturnValue(true);
    const { addSightedTracks } = await import("@/lib/pennSightings");
    const { fixtureVehicles } = await import("@/lib/fixtures");
    const result = await addSightedTracks([{ ...base, trainNumber: "6647" }], async () => fixtureVehicles());
    expect(result[0].sightedTrack).toBe("9"); expect(redisCommand).not.toHaveBeenCalled();
  });
});
