import { afterEach, describe, expect, it, vi } from "vitest";
import type { Departure } from "@/lib/departures";

const redisCommand = vi.fn(); const usingFixtures = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/njtTokenStore", () => ({ redisCommand }));
vi.mock("@/lib/njtClient", () => ({ usingFixtures }));
afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); vi.useRealTimers(); });

const base: Departure = { id: "x", destination: "Trenton", scheduledTime: "2024-05-30T15:00:00.000Z", expectedTime: "2024-05-30T15:00:00.000Z", trainNumber: "1", line: "Northeast Corridor Line", lineCode: "NE", track: "", status: "on-time", statusText: "", delayMinutes: 0 };
const position = { circuit: "P9", atPenn: true, updatedAt: null, predictedTrack: "9", confidence: 0.95 };
const snapshot = (at: string) => ({ v: 1, at, predictions: { [`1|${base.scheduledTime}`]: position, [`2|${base.scheduledTime}`]: position, [`3|${base.scheduledTime}`]: position } });
const NOW = Date.parse("2024-05-30T14:50:00.000Z");

describe("Penn predictions on the board", () => {
  it("adds a fresh prediction only to its own unposted, running train", async () => {
    const { applyPredictions } = await import("@/lib/pennPredictions");
    const result = applyPredictions([
      base,
      { ...base, trainNumber: "2", track: "7" },
      { ...base, trainNumber: "3", status: "cancelled" },
      { ...base, trainNumber: "1", scheduledTime: "2024-05-31T15:00:00.000Z" },
    ], snapshot("2024-05-30T14:49:30.000Z"), NOW);
    expect(result.map((d) => d.position)).toEqual([position, undefined, undefined, undefined]);
  });

  it("ignores predictions a stalled collector left behind", async () => {
    const { applyPredictions } = await import("@/lib/pennPredictions");
    expect(applyPredictions([base], snapshot("2024-05-30T14:40:00.000Z"), NOW)[0].position).toBeUndefined();
    expect(applyPredictions([base], null, NOW)[0].position).toBeUndefined();
  });

  it("reads published predictions with one Redis GET, reused briefly", async () => {
    usingFixtures.mockReturnValue(false);
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    redisCommand.mockResolvedValue(JSON.stringify(snapshot("2024-05-30T14:49:30.000Z")));
    const { addPredictions } = await import("@/lib/pennPredictions");
    expect((await addPredictions([base]))[0].position).toEqual(position);
    await addPredictions([base]);
    expect(redisCommand).toHaveBeenCalledTimes(1);
    expect(redisCommand).toHaveBeenCalledWith("GET", "departure-board:penn-predictions:v1");
  });

  it("shows the board without predictions when Redis fails", async () => {
    usingFixtures.mockReturnValue(false); vi.spyOn(console, "error").mockImplementation(() => {});
    redisCommand.mockRejectedValue(new Error("redis down"));
    const { addPredictions } = await import("@/lib/pennPredictions");
    const departures = [base];
    expect(await addPredictions(departures)).toBe(departures);
  });

  it("predicts from canned vehicles and history for fixtures, without Redis", async () => {
    usingFixtures.mockReturnValue(true);
    const { addPredictions } = await import("@/lib/pennPredictions");
    const result = await addPredictions([{ ...base, trainNumber: "6647" }, { ...base, trainNumber: "3251" }, { ...base, trainNumber: "3863" }]);
    expect(result[0].position).toMatchObject({ predictedTrack: "9", confidence: 19 / 20 });
    expect(result[1].position).toMatchObject({ predictedTrack: "2", confidence: 3 / 5 });
    expect(result[2].position).toBeUndefined();
    expect(redisCommand).not.toHaveBeenCalled();
  });
});
