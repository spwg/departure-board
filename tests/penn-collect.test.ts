import { describe, expect, it, vi } from "vitest";
import type { RawDeparture } from "@/lib/departures";
import { InvalidTokenError } from "@/lib/njtApi";
import { collectPenn, type CollectDeps } from "@/lib/pennCollect";
import { COLLECTOR_STATE_KEY, PREDICTIONS_KEY, agedDayKeys } from "@/lib/pennStore";

const NOW = Date.parse("2026-09-28T20:00:00.000Z");
const AT_PENN = { LATITUDE: "40.7506", LONGITUDE: "-73.9935" };
const raw = (train: string, track: string, minutes: number): RawDeparture => ({
  STATION_2CHAR: "NY", TRAIN_ID: train, LINECODE: "NE", LINE: "Northeast Corridor Line", LINEABBREVIATION: "NEC",
  DESTINATION: "Trenton", SCHED_DEP_DATE: "28-Sep-2026 04:" + String(minutes).padStart(2, "0") + ":00 PM", TRACK: track, STATUS: "in 5 Min", SEC_LATE: "0",
}) as unknown as RawDeparture;

/**
 * A Redis stand-in: GET answers with the stored collector state, the ageing
 * script with `table`, the save script by remembering the state it saves.
 */
function fakeRedis(table: string[] = ["P9\t9", "20"]) {
  let stored: string | null = null;
  return vi.fn(async (...command: Array<string | number>) => {
    if (command[0] === "GET") return command[1] === COLLECTOR_STATE_KEY ? stored : null;
    if (command[0] === "EVAL" && command[3] === "departure-board:penn-circuits:v2" && command[2] === 31) return table;
    if (command[0] === "EVAL") {
      stored = command[14] as string;
      return command.length - 19 - Number(command[18]);
    }
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

const ageing = (redis: ReturnType<typeof fakeRedis>) =>
  redis.mock.calls.filter((call) => call[0] === "EVAL" && call[2] === 31);
const saves = (redis: ReturnType<typeof fakeRedis>) =>
  redis.mock.calls.filter((call) => call[0] === "EVAL" && call[2] === 6);

/** A save call's parts, by the positions saveCollection writes them in. */
function saved(call: unknown[]) {
  const pairings = Number(call[18]);
  return {
    keys: call.slice(3, 9),
    pollField: call[11] as string,
    setPollsExpiry: call[12],
    setPairingsExpiry: call[13],
    state: JSON.parse(call[14] as string),
    predictions: JSON.parse(call[16] as string),
    pairings: call.slice(19, 19 + pairings),
    entries: call.slice(19 + pairings).map((entry) => JSON.parse(entry as string)),
  };
}

describe("Penn collector", () => {
  it("records pairings, predicts unposted trains, logs the board and publishes predictions", async () => {
    const d = deps();
    const summary = await collectPenn(d);
    expect(summary).toMatchObject({ event: "penn-collect", departures: 2, predicted: 1, recorded: 1, logged: 2, vehicles: true, history: true, at: new Date(NOW).toISOString() });
    expect(d.njt.departures).toHaveBeenCalledWith("token", "NY");
    // One token read serves both NJ Transit calls.
    expect(d.token.get).toHaveBeenCalledTimes(1);

    const [age] = ageing(d.redis);
    expect(age.slice(4)).toEqual(agedDayKeys(NOW));

    const [save] = saves(d.redis);
    const parts = saved(save);
    expect(parts.keys).toEqual([
      "departure-board:penn-circuits:v2",
      "departure-board:penn-circuits:v2:day:2026-09-28",
      "departure-board:penn-board-log:v1:2026-09-28",
      "departure-board:penn-board-log:v1:polls:2026-09-28",
      COLLECTOR_STATE_KEY,
      PREDICTIONS_KEY,
    ]);
    expect(parts.pairings).toEqual(["P7\t7"]);
    expect(parts.pollField).toMatch(/:collector:ok$/);
    expect(parts.setPollsExpiry).toBe(1);
    expect(parts.setPairingsExpiry).toBe(1);
    expect(parts.predictions.at).toBe(new Date(NOW).toISOString());
    expect(Object.values(parts.predictions.predictions)).toEqual([expect.objectContaining({ circuit: "P9", predictedTrack: "9", confidence: 21 / 22 })]);
    expect(parts.entries[0]).toMatchObject({ kind: "first", source: "collector", trainNumber: "3861", shownTrack: "9", shownTrackKind: "predicted", shownConfidence: 95 });
    expect(parts.entries[1]).toMatchObject({ kind: "first", trainNumber: "3247", shownTrack: "7", shownTrackKind: "posted" });
    // The recorded pairing is in the carried history, so the next run need not reload it.
    expect(parts.state.table).toEqual(["P9\t9", "20", "P7\t7", "1"]);
    expect(parts.state.tableDay).toBe("2026-09-28");
  });

  it("logs only what changed on later runs, records each pairing once, and logs trains that leave", async () => {
    const d = deps();
    await collectPenn(d);
    // Same board a minute later: nothing to log, nothing new to record, and
    // the history is not reloaded.
    await collectPenn({ ...d, now: () => NOW + 60_000 });
    expect(ageing(d.redis)).toHaveLength(1);
    const second = saved(saves(d.redis)[1]);
    expect(second.entries).toEqual([]);
    expect(second.pairings).toEqual([]);
    expect(second.setPollsExpiry).toBe(0);

    // 3247 departs the board and 3861 gets its posted track.
    d.njt.departures = vi.fn(async () => [raw("3861", "9", 10)]);
    await collectPenn({ ...d, now: () => NOW + 120_000 });
    const third = saved(saves(d.redis)[2]);
    expect(third.entries).toEqual([
      expect.objectContaining({ kind: "change", id: "3861|2026-09-28T20:10:00.000Z", postedTrack: "9", shownTrackKind: "posted" }),
      { kind: "gone", v: 1, at: new Date(NOW + 120_000).toISOString(), source: "collector", id: "3247|2026-09-28T20:20:00.000Z" },
    ]);
    expect(third.pairings).toEqual(["P9\t9"]);
    expect(Object.keys(third.state.trains)).toEqual(["3861|2026-09-28T20:10:00.000Z"]);
  });

  it("still logs the board, marked unable to predict, when the vehicle feed fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({ njt: { departures: vi.fn(async () => [raw("3861", "", 10)]), vehicles: vi.fn(async () => { throw new Error("down"); }) } });
    expect(await collectPenn(d)).toMatchObject({ vehicles: false, history: false, predicted: 0 });
    expect(ageing(d.redis)).toHaveLength(0);
    const parts = saved(saves(d.redis)[0]);
    expect(parts.pollField).toMatch(/:collector:no-vehicles$/);
    expect(parts.predictions.predictions).toEqual({});
  });

  it("reads positions only for the board's trains, and stays healthy when none are running", async () => {
    const d = deps({ njt: { departures: vi.fn(async () => [raw("3861", "", 10)]), vehicles: vi.fn(async () => [{ ID: "9999", ICS_TRACK_CKT: "FAR" }]) } });
    expect(await collectPenn(d)).toMatchObject({ vehicles: true, history: true, predicted: 0 });
    expect(ageing(d.redis)).toHaveLength(1); // no pairings, but the history still loads
    const parts = saved(saves(d.redis)[0]);
    expect(parts.pollField).toMatch(/:collector:ok$/);
    expect(parts.entries[0]).toMatchObject({ trainNumber: "3861", circuit: null });
  });

  it("replaces a rejected token once and retries", async () => {
    const get = vi.fn().mockResolvedValueOnce("stale").mockResolvedValue("fresh");
    const departures = vi.fn(async (token: string) => { if (token === "stale") throw new InvalidTokenError(token); return [raw("3861", "", 10)]; });
    const vehicles = vi.fn(async (token: string) => { if (token === "stale") throw new InvalidTokenError(token); return []; });
    const d = deps({ token: { get, invalidate: vi.fn(async () => {}) }, njt: { departures, vehicles } });
    await collectPenn(d);
    // Both calls were rejected, but the token is replaced only once.
    expect(d.token.invalidate).toHaveBeenCalledTimes(1);
    expect(d.token.invalidate).toHaveBeenCalledWith("stale");
    expect(get).toHaveBeenCalledTimes(2);
    expect(departures).toHaveBeenLastCalledWith("fresh", "NY");
    expect(vehicles).toHaveBeenLastCalledWith("fresh");
  });

  it("writes nothing when the board itself cannot load", async () => {
    const d = deps({ njt: { departures: vi.fn(async () => { throw new Error("NJT down"); }), vehicles: vi.fn(async () => []) } });
    await expect(collectPenn(d)).rejects.toThrow("NJT down");
    expect(d.redis).not.toHaveBeenCalled();
  });
});
