import { afterEach, describe, expect, it, vi } from "vitest";
import type { Departure } from "@/lib/departures";

const redisCommand = vi.fn(); const usingFixtures = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/njtTokenStore", () => ({ redisCommand }));
vi.mock("@/lib/njtClient", () => ({ usingFixtures }));
afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

const base: Departure = { id: "x", destination: "Trenton", scheduledTime: "2024-05-30T15:00:00.000Z", expectedTime: "2024-05-30T15:00:00.000Z", trainNumber: "1", line: "Northeast Corridor Line", lineCode: "NE", track: "", status: "on-time", statusText: "", delayMinutes: 0 };
const AT_PENN = { LATITUDE: "40.7506", LONGITUDE: "-73.9935" };
/** EVAL calls whose keys include `key`. */
const evals = (key: string) => redisCommand.mock.calls.filter((call) => call[0] === "EVAL" && call.some((part) => String(part).includes(key)));

describe("Penn train positions", () => {
  it("records a posted train's pairing once and positions an unposted train with its predicted track", async () => {
    usingFixtures.mockReturnValue(false);
    redisCommand.mockImplementation(async (command: string) => command === "HGETALL" ? ["P9\t9", "20"] : 1);
    const { addTrainPositions } = await import("@/lib/pennPositions");
    const departures = [{ ...base, trainNumber: "1" }, { ...base, trainNumber: "2", track: "5" }];
    const vehicles = async () => [{ ID: "1", ICS_TRACK_CKT: "P9", ...AT_PENN }, { ID: "2", ICS_TRACK_CKT: "P5", ...AT_PENN }];

    const result = await addTrainPositions(departures, vehicles);
    await addTrainPositions(departures, vehicles);

    expect(result[0].position).toEqual({ circuit: "P9", atPenn: true, updatedAt: null, predictedTrack: "9", confidence: 21 / 22 });
    expect(result[1].position).toBeUndefined();
    const records = evals("penn-circuits-seen");
    expect(records).toHaveLength(1);
    expect(records[0]).toContain("P5\t5");
    expect(records[0][5]).toMatch(/^departure-board:penn-circuits:v2:day:\d{4}-\d{2}-\d{2}$/);
  });

  it("still attaches positions, without predictions, when the history store is down", async () => {
    usingFixtures.mockReturnValue(false); vi.spyOn(console, "error").mockImplementation(() => {});
    redisCommand.mockRejectedValue(new Error("redis down"));
    const { addTrainPositions } = await import("@/lib/pennPositions");
    const result = await addTrainPositions([base], async () => [{ ID: "1", ICS_TRACK_CKT: "P9", ...AT_PENN }]);
    expect(result[0].position).toEqual({ circuit: "P9", atPenn: true, updatedAt: null });
  });

  it("returns the board unchanged when vehicle data fails, and still logs it", async () => {
    usingFixtures.mockReturnValue(false); vi.spyOn(console, "error").mockImplementation(() => {});
    redisCommand.mockResolvedValue(1);
    const { addTrainPositions } = await import("@/lib/pennPositions");
    const departures = [base];
    expect(await addTrainPositions(departures, async () => { throw new Error("down"); })).toBe(departures);
    const [log] = evals("penn-board-log");
    expect(log.find((part) => String(part).includes(":no-vehicles"))).toBeTruthy();
  });

  it("logs what the board showed, crediting the source", async () => {
    usingFixtures.mockReturnValue(false);
    redisCommand.mockImplementation(async (command: string) => command === "HGETALL" ? ["P9\t9", "20"] : 1);
    const { addTrainPositions } = await import("@/lib/pennPositions");
    await addTrainPositions([base, { ...base, trainNumber: "2", track: "5" }], async () => [{ ID: "1", ICS_TRACK_CKT: "P9", ...AT_PENN }], "collector");

    const [log] = evals("penn-board-log");
    expect(log[3]).toBe("departure-board:penn-board-log:v1:state");
    expect(log[4]).toMatch(/^departure-board:penn-board-log:v1:\d{4}-\d{2}-\d{2}$/);
    expect(log[5]).toMatch(/^departure-board:penn-board-log:v1:polls:/);
    expect(log[8]).toMatch(/^\d+:collector:ok$/);
    expect(log[10]).toBe(2);
    const first = JSON.parse(log[13] as string);
    expect(first).toMatchObject({ kind: "first", source: "collector", id: `1|${base.scheduledTime}`, trainNumber: "1", line: "Northeast Corridor Line", shownTrack: "9", shownTrackKind: "predicted", shownConfidence: 95, circuit: "P9", history: { pairings: 20, topTrack: "9", topCount: 20 } });
    const change = JSON.parse(log[14] as string);
    expect(change).toMatchObject({ kind: "change", shownTrack: "9" });
    expect(change.line).toBeUndefined();
    expect(JSON.parse(log[17] as string)).toMatchObject({ trainNumber: "2", postedTrack: "5", shownTrackKind: "posted", shownConfidence: null });
  });

  it("never lets the board log break the board", async () => {
    usingFixtures.mockReturnValue(false); vi.spyOn(console, "error").mockImplementation(() => {});
    redisCommand.mockImplementation(async (command: string, script?: string) => {
      if (command === "EVAL" && String(script).includes("HKEYS")) throw new Error("log down");
      return command === "HGETALL" ? ["P9\t9", "20"] : 1;
    });
    const { addTrainPositions } = await import("@/lib/pennPositions");
    const result = await addTrainPositions([base], async () => [{ ID: "1", ICS_TRACK_CKT: "P9", ...AT_PENN }]);
    expect(result[0].position?.predictedTrack).toBe("9");
  });

  it("takes days past the 90-day window back out of the running counts", async () => {
    usingFixtures.mockReturnValue(false);
    redisCommand.mockImplementation(async (command: string) => command === "HGETALL" ? [] : 0);
    const { loadCircuitTable, agedDayKeys } = await import("@/lib/pennPositionStore");
    await loadCircuitTable();
    const [ageOut] = evals("penn-circuits:v2:day:");
    expect(ageOut[3]).toBe("departure-board:penn-circuits:v2");
    expect(ageOut.slice(4)).toEqual(agedDayKeys(Date.now()));
    const keys = agedDayKeys(Date.parse("2026-09-28T16:00:00Z"));
    expect(keys[0]).toBe("departure-board:penn-circuits:v2:day:2026-06-30");
    expect(keys).toHaveLength(30);
  });

  it("uses canned history instead of Redis for fixtures", async () => {
    usingFixtures.mockReturnValue(true);
    const { addTrainPositions } = await import("@/lib/pennPositions");
    const { fixtureVehicles } = await import("@/lib/fixtures");
    const result = await addTrainPositions([{ ...base, trainNumber: "6647" }, { ...base, trainNumber: "3251" }], async () => fixtureVehicles());
    expect(result[0].position).toMatchObject({ atPenn: true, predictedTrack: "9", confidence: 19 / 20 });
    expect(result[1].position).toMatchObject({ atPenn: true, circuit: "FIXTURE-PLATFORM-2", predictedTrack: "2", confidence: 3 / 5 });
    expect(redisCommand).not.toHaveBeenCalled();
  });

});
