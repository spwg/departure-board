import { describe, expect, it } from "vitest";
import type { Departure } from "@/lib/departures";
import {
  MIN_SAMPLES,
  circuitField,
  circuitObservations,
  circuitsByTrain,
  parseCircuitTable,
  trackForCircuit,
  withSightedTracks,
  type CircuitTable,
} from "@/lib/platformSightings";

const base: Departure = { id: "x", destination: "Trenton", scheduledTime: "2024-05-30T15:00:00.000Z", expectedTime: "2024-05-30T15:00:00.000Z", trainNumber: "3861", line: "Northeast Corridor Line", lineCode: "NE", track: "", status: "on-time", statusText: "", delayMinutes: 0 };
const table = (entries: Record<string, Record<string, number>>): CircuitTable =>
  new Map(Object.entries(entries).map(([circuit, tracks]) => [circuit, new Map(Object.entries(tracks))]));

describe("platform sightings", () => {
  it("reads the latest trimmed circuit per train and ignores blank records", () => {
    const circuits = circuitsByTrain([{ ID: " 3861 ", ICS_TRACK_CKT: " ny-9tk " }, { ID: "", ICS_TRACK_CKT: "X" }, { ID: "6647", ICS_TRACK_CKT: "" }]);
    expect([...circuits]).toEqual([["3861", "NY-9TK"]]);
  });

  it("learns only from posted trains that have not departed", () => {
    const circuits = new Map([["1", "C1"], ["2", "C2"], ["3", "C3"]]);
    const observations = circuitObservations([
      { ...base, trainNumber: "1", track: "9" },
      { ...base, trainNumber: "2", track: "" },
      { ...base, trainNumber: "3", track: "4", status: "departed" },
      { ...base, trainNumber: "4", track: "5" },
    ], circuits);
    expect(observations).toEqual([{ trainNumber: "1", circuit: "C1", track: "9" }]);
  });

  it("trusts a circuit only with enough samples that agree", () => {
    const learned = table({ PLATFORM: { "9": MIN_SAMPLES }, THIN: { "9": MIN_SAMPLES - 1 }, APPROACH: { "3": 6, "4": 5 }, MOSTLY: { "7": 40, "8": 1 } });
    expect(trackForCircuit(learned, "PLATFORM")).toBe("9");
    expect(trackForCircuit(learned, "THIN")).toBeNull();
    expect(trackForCircuit(learned, "APPROACH")).toBeNull();
    expect(trackForCircuit(learned, "MOSTLY")).toBe("7");
    expect(trackForCircuit(learned, "UNKNOWN")).toBeNull();
  });

  it("sights only unposted, running trains and never overrides a posted track", () => {
    const learned = table({ P9: { "9": 20 }, P5: { "5": 20 } });
    const circuits = new Map([["1", "P9"], ["2", "P5"], ["3", "P9"], ["4", "P9"]]);
    const result = withSightedTracks([
      { ...base, trainNumber: "1" },
      { ...base, trainNumber: "2", track: "7" },
      { ...base, trainNumber: "3", status: "cancelled" },
      { ...base, trainNumber: "4", status: "departed" },
      { ...base, trainNumber: "5" },
    ], circuits, learned);
    expect(result.map((d) => d.sightedTrack)).toEqual(["9", undefined, undefined, undefined, undefined]);
  });

  it("parses HGETALL replies and skips malformed fields", () => {
    const parsed = parseCircuitTable([circuitField("P9", "9"), "12", "garbage", "3", circuitField("P9", "8"), "x", circuitField("P5", "5"), "2"]);
    expect([...parsed.get("P9")!]).toEqual([["9", 12]]);
    expect([...parsed.get("P5")!]).toEqual([["5", 2]]);
    expect(parsed.has("garbage")).toBe(false);
    expect(parseCircuitTable(null).size).toBe(0);
  });
});
