import { describe, expect, it, vi } from "vitest";
import type { RawDeparture } from "@/lib/departures";
import { InvalidTokenError } from "@/lib/njtApi";
import { collectPenn, type CollectDeps } from "@/lib/pennCollect";
import { PREDICTIONS_KEY, agedDayKeys } from "@/lib/pennStore";

const NOW = Date.parse("2026-09-28T20:00:00.000Z");
const AT_PENN = { LATITUDE: "40.7506", LONGITUDE: "-73.9935" };
const raw = (train: string, track: string, minutes: number): RawDeparture => ({
  STATION_2CHAR: "NY", TRAIN_ID: train, LINECODE: "NE", LINE: "Northeast Corridor Line", LINEABBREVIATION: "NEC",
  DESTINATION: "Trenton", SCHED_DEP_DATE: "28-Sep-2026 04:" + String(minutes).padStart(2, "0") + ":00 PM", TRACK: track, STATUS: "in 5 Min", SEC_LATE: "0",
}) as unknown as RawDeparture;

/** A Redis stand-in: the history script answers with `table`, everything else with 1. */
function fakeRedis(table: string[] = ["P9\t9", "20"]) {
  return vi.fn(async (...command: Array<string | number>) => {
    if (command[0] === "EVAL" && String(command[1]).includes("HGETALL', KEYS[1]")) return [1, table];
    return 1;
  }) as unknown as CollectDeps["redis"] & ReturnType<typeof vi.fn>;
}

function deps(overrides: Partial<CollectDeps> = {}): CollectDeps & { redis: ReturnType<typeof fakeRedis> } {
  return {
    redis: fakeRedis(),
    token: { get: vi.fn(async () => "token"), invalidate: vi.fn(async () => {}) },
    njt: {
      departures: vi.fn(async () => [raw("3861", "", 10), raw("3247", "7", 20)]),
      vehicles: vi.fn(async () => [{ ID: "3861", ICS_TRACK_CKT: "P9", ...AT_PENN }, { ID: "3247", ICS_TRACK_CKT: "P7", ...AT_PENN }, { ID: "9999", ICS_TRACK_CKT: "FAR" }]),
    },
    now: () => NOW,
    ...overrides,
  } as never;
}

const evals = (redis: ReturnType<typeof fakeRedis>, marker: string) =>
  redis.mock.calls.filter((call) => call[0] === "EVAL" && String(call[1]).includes(marker));

describe("Penn collector", () => {
  it("records pairings, predicts unposted trains, logs the board and publishes predictions", async () => {
    const d = deps();
    const summary = await collectPenn(d);
    expect(summary).toMatchObject({ event: "penn-collect", departures: 2, predicted: 1, vehicles: true, history: true, at: new Date(NOW).toISOString() });
    expect(d.njt.departures).toHaveBeenCalledWith("token", "NY");

    const [history] = evals(d.redis, "HGETALL', KEYS[1]");
    expect(history[2]).toBe(3 + 1 + 30); // counts, today, marker, one pairing, aged days
    expect(history.slice(3, 6)).toEqual(["departure-board:penn-circuits:v2", "departure-board:penn-circuits:v2:day:2026-09-28", "departure-board:penn-circuits:v2:aged:2026-09-28"]);
    expect(history[6]).toBe("departure-board:penn-circuits-seen:v2:3247|P7|7");
    expect(history.slice(7, 37)).toEqual(agedDayKeys(NOW));
    expect(history.at(-1)).toBe("P7\t7");

    const [log] = evals(d.redis, "HKEYS");
    expect(log[6]).toBe(PREDICTIONS_KEY);
    const published = JSON.parse(log.at(-2) as string);
    expect(published.at).toBe(new Date(NOW).toISOString());
    expect(Object.values(published.predictions)).toEqual([expect.objectContaining({ circuit: "P9", predictedTrack: "9", confidence: 21 / 22 })]);
    expect(log.at(-1)).toBe(180);
    const first = JSON.parse(log[14] as string);
    expect(first).toMatchObject({ kind: "first", source: "collector", trainNumber: "3861", shownTrack: "9", shownTrackKind: "predicted", shownConfidence: 95 });
  });

  it("still logs the board, marked unable to predict, when the vehicle feed fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({ njt: { departures: vi.fn(async () => [raw("3861", "", 10)]), vehicles: vi.fn(async () => { throw new Error("down"); }) } });
    expect(await collectPenn(d)).toMatchObject({ vehicles: false, history: false, predicted: 0 });
    expect(evals(d.redis, "HGETALL', KEYS[1]")).toHaveLength(0);
    const [log] = evals(d.redis, "HKEYS");
    expect(log[9]).toMatch(/:collector:no-vehicles$/);
    expect(JSON.parse(log.at(-2) as string).predictions).toEqual({});
  });

  it("replaces a rejected token once and retries", async () => {
    const get = vi.fn().mockResolvedValueOnce("stale").mockResolvedValue("fresh");
    const departures = vi.fn(async (token: string) => { if (token === "stale") throw new InvalidTokenError(token); return [raw("3861", "", 10)]; });
    const d = deps({ token: { get, invalidate: vi.fn(async () => {}) }, njt: { departures, vehicles: vi.fn(async () => []) } });
    await collectPenn(d);
    expect(d.token.invalidate).toHaveBeenCalledWith("stale");
    expect(departures).toHaveBeenLastCalledWith("fresh", "NY");
  });

  it("writes nothing when the board itself cannot load", async () => {
    const d = deps({ njt: { departures: vi.fn(async () => { throw new Error("NJT down"); }), vehicles: vi.fn(async () => []) } });
    await expect(collectPenn(d)).rejects.toThrow("NJT down");
    expect(d.redis).not.toHaveBeenCalled();
  });
});
