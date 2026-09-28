import { describe, expect, it } from "vitest";
import { boardSnapshots, changeEvent, changeKey, logDay, logMinute } from "@/lib/boardLog";
import type { Departure } from "@/lib/departures";

const base: Departure = { id: "x", destination: "Trenton", scheduledTime: "2024-05-30T15:00:00.000Z", expectedTime: "2024-05-30T15:00:00.000Z", trainNumber: "3861", line: "Northeast Corridor Line", lineCode: "NE", track: "", status: "on-time", statusText: "", delayMinutes: 0 };
const table = new Map([["P9", new Map([["9", 3], ["8", 1]])]]);

describe("board log", () => {
  it("snapshots what the board showed and the history behind it", () => {
    const [unposted, posted, none] = boardSnapshots([
      { ...base, position: { circuit: "P9", atPenn: true, updatedAt: "2024-05-30T14:50:00.000Z", predictedTrack: "9", confidence: 4 / 6 } },
      { ...base, trainNumber: "2", track: "5" },
      { ...base, trainNumber: "3" },
    ], new Map([["3861", { circuit: "P9", atPenn: true, updatedAt: "2024-05-30T14:50:00.000Z" }], ["2", { circuit: "P5", atPenn: true, updatedAt: null }]]), table);

    expect(unposted).toMatchObject({ id: "3861|2024-05-30T15:00:00.000Z", postedTrack: null, shownTrack: "9", shownTrackKind: "predicted", shownConfidence: 67, shownCircuit: "P9", history: { pairings: 4, topTrack: "9", topCount: 3 } });
    expect(posted).toMatchObject({ postedTrack: "5", shownTrack: "5", shownTrackKind: "posted", shownConfidence: null, circuit: "P5", history: { pairings: 0, topTrack: null, topCount: 0 } });
    expect(none).toMatchObject({ circuit: null, atPenn: null, shownTrack: null, shownTrackKind: null, history: null });
  });

  it("logs a change only when riders could see one or the train moves inside Penn", () => {
    const [snapshot] = boardSnapshots([base], new Map([["3861", { circuit: "HO-1", atPenn: false, updatedAt: null }]]), table);
    const key = changeKey(snapshot);
    expect(changeKey({ ...snapshot, positionUpdatedAt: "later", history: { pairings: 9, topTrack: "1", topCount: 9 } })).toBe(key);
    expect(changeKey({ ...snapshot, circuit: "HO-2", shownCircuit: "HO-2" })).toBe(key);
    expect(changeKey({ ...snapshot, circuit: "P9", atPenn: true })).not.toBe(key);
    expect(changeKey({ ...snapshot, shownTrack: "9", shownTrackKind: "predicted", shownConfidence: 67 })).not.toBe(key);
    expect(changeKey({ ...snapshot, shownConfidence: 70 })).not.toBe(key);
    expect(changeKey({ ...snapshot, delayMinutes: 5 })).not.toBe(key);
  });

  it("leaves fixed fields out of change entries", () => {
    const [snapshot] = boardSnapshots([base], new Map(), table);
    const change = changeEvent("2024-05-30T14:55:00.000Z", "board", snapshot);
    expect(change).toMatchObject({ kind: "change", id: snapshot.id, status: "on-time" });
    for (const field of ["trainNumber", "line", "lineCode", "destination", "scheduledTime"]) expect(change).not.toHaveProperty(field);
  });

  it("files entries by Eastern day and minute, across daylight saving", () => {
    expect(logDay("2024-05-31T03:30:00.000Z")).toBe("2024-05-30");
    expect(logMinute("2024-05-31T03:30:00.000Z")).toBe(23 * 60 + 30);
    expect(logMinute("2024-01-15T05:00:00.000Z")).toBe(0);
  });
});
