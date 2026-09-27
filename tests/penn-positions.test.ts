import { afterEach, describe, expect, it, vi } from "vitest";
import type { Departure } from "@/lib/departures";

const redisCommand = vi.fn(); const usingFixtures = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/njtTokenStore", () => ({ redisCommand }));
vi.mock("@/lib/njtClient", () => ({ usingFixtures }));
afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

const base: Departure = { id: "x", destination: "Trenton", scheduledTime: "2024-05-30T15:00:00.000Z", expectedTime: "2024-05-30T15:00:00.000Z", trainNumber: "1", line: "Northeast Corridor Line", lineCode: "NE", track: "", status: "on-time", statusText: "", delayMinutes: 0 };
const AT_PENN = { LATITUDE: "40.7506", LONGITUDE: "-73.9935" };

describe("Penn train positions", () => {
  it("records a posted train's pairing once and positions an unposted train with its history platform", async () => {
    usingFixtures.mockReturnValue(false);
    redisCommand.mockImplementation(async (command: string) => command === "HGETALL" ? ["P9\t9", "20"] : 1);
    const { addTrainPositions } = await import("@/lib/pennPositions");
    const departures = [{ ...base, trainNumber: "1" }, { ...base, trainNumber: "2", track: "5" }];
    const vehicles = async () => [{ ID: "1", ICS_TRACK_CKT: "P9", ...AT_PENN }, { ID: "2", ICS_TRACK_CKT: "P5", ...AT_PENN }];

    const result = await addTrainPositions(departures, vehicles);
    await addTrainPositions(departures, vehicles);

    expect(result[0].position).toEqual({ circuit: "P9", atPenn: true, updatedAt: null, historyTrack: "9" });
    expect(result[1].position).toBeUndefined();
    const evals = redisCommand.mock.calls.filter(([command]) => command === "EVAL");
    expect(evals).toHaveLength(1);
    expect(evals[0]).toContain("P5\t5");
    expect(JSON.parse(evals[0][8] as string)).toMatchObject({ trainNumber: "2", circuit: "P5", track: "5", scheduledTime: base.scheduledTime });
  });

  it("still shows raw positions when the history store is down", async () => {
    usingFixtures.mockReturnValue(false); vi.spyOn(console, "error").mockImplementation(() => {});
    redisCommand.mockRejectedValue(new Error("redis down"));
    const { addTrainPositions } = await import("@/lib/pennPositions");
    const result = await addTrainPositions([base], async () => [{ ID: "1", ICS_TRACK_CKT: "P9", ...AT_PENN }]);
    expect(result[0].position).toEqual({ circuit: "P9", atPenn: true, updatedAt: null });
  });

  it("returns the board unchanged when vehicle data fails", async () => {
    usingFixtures.mockReturnValue(false); vi.spyOn(console, "error").mockImplementation(() => {});
    const { addTrainPositions } = await import("@/lib/pennPositions");
    const departures = [base];
    expect(await addTrainPositions(departures, async () => { throw new Error("down"); })).toBe(departures);
  });

  it("uses canned history instead of Redis for fixtures", async () => {
    usingFixtures.mockReturnValue(true);
    const { addTrainPositions } = await import("@/lib/pennPositions");
    const { fixtureVehicles } = await import("@/lib/fixtures");
    const result = await addTrainPositions([{ ...base, trainNumber: "6647" }, { ...base, trainNumber: "3251" }], async () => fixtureVehicles());
    expect(result[0].position).toMatchObject({ atPenn: true, historyTrack: "9" });
    expect(result[1].position).toMatchObject({ atPenn: true, circuit: "FIXTURE-PLATFORM-2" });
    expect(result[1].position?.historyTrack).toBeUndefined();
    expect(redisCommand).not.toHaveBeenCalled();
  });

  it("loads history newest first and skips malformed entries", async () => {
    usingFixtures.mockReturnValue(false);
    const event = { trainNumber: "1", circuit: "P9", track: "9", scheduledTime: base.scheduledTime, recordedAt: base.scheduledTime };
    redisCommand.mockImplementation(async (command: string) => command === "HGETALL" ? ["P9\t9", "4"] : [JSON.stringify(event), "not json", JSON.stringify({ circuit: "P9" })]);
    const { loadPositionHistory } = await import("@/lib/pennPositionStore");
    const history = await loadPositionHistory();
    expect(history.events).toEqual([event]);
    expect([...history.table.get("P9")!]).toEqual([["9", 4]]);
  });
});
