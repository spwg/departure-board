import { describe, expect, it } from "vitest";
import type { Departure } from "@/lib/departures";
import {
  MIN_SAMPLES,
  circuitField,
  circuitObservations,
  isAtPenn,
  parseCircuitTable,
  readingsByTrain,
  summarizeCircuit,
  trackForCircuit,
  withTrainPositions,
  type CircuitTable,
  type VehicleReading,
} from "@/lib/trainPositions";

const base: Departure = { id: "x", destination: "Trenton", scheduledTime: "2024-05-30T15:00:00.000Z", expectedTime: "2024-05-30T15:00:00.000Z", trainNumber: "3861", line: "Northeast Corridor Line", lineCode: "NE", track: "", status: "on-time", statusText: "", delayMinutes: 0 };
const table = (entries: Record<string, Record<string, number>>): CircuitTable =>
  new Map(Object.entries(entries).map(([circuit, tracks]) => [circuit, new Map(Object.entries(tracks))]));
const reading = (circuit: string, atPenn = true): VehicleReading => ({ circuit, atPenn, updatedAt: null });

describe("train positions", () => {
  it("places coordinates inside New York Penn and nowhere else", () => {
    expect(isAtPenn("40.7506", "-73.9935")).toBe(true);
    expect(isAtPenn("40.7453", "-74.0179")).toBe(false); // Hudson tunnel portal side
    expect(isAtPenn("", "")).toBe(false);
    expect(isAtPenn(undefined, "-73.99")).toBe(false);
  });

  it("reads a trimmed circuit, Penn flag and timestamp per train, skipping blank records", () => {
    const readings = readingsByTrain([
      { ID: " 3861 ", ICS_TRACK_CKT: " ny-9tk ", LATITUDE: "40.7506", LONGITUDE: "-73.9935", LAST_MODIFIED: "30-May-2024 11:56:00 AM" },
      { ID: "", ICS_TRACK_CKT: "X" },
      { ID: "6647", ICS_TRACK_CKT: "" },
    ]);
    expect([...readings]).toEqual([["3861", { circuit: "NY-9TK", atPenn: true, updatedAt: "2024-05-30T15:56:00.000Z" }]]);
  });

  it("keeps history only for posted trains that have not departed", () => {
    const readings = new Map([["1", reading("C1")], ["2", reading("C2")], ["3", reading("C3")]]);
    const observations = circuitObservations([
      { ...base, trainNumber: "1", track: "9" },
      { ...base, trainNumber: "2", track: "" },
      { ...base, trainNumber: "3", track: "4", status: "departed" },
      { ...base, trainNumber: "4", track: "5" },
    ], readings);
    expect(observations).toEqual([{ trainNumber: "1", circuit: "C1", track: "9", scheduledTime: base.scheduledTime }]);
  });

  it("lets a circuit name a platform only when enough history agrees", () => {
    const learned = table({ PLATFORM: { "9": MIN_SAMPLES }, THIN: { "9": MIN_SAMPLES - 1 }, APPROACH: { "3": 6, "4": 5 }, MOSTLY: { "7": 40, "8": 1 } });
    expect(trackForCircuit(learned, "PLATFORM")).toBe("9");
    expect(trackForCircuit(learned, "THIN")).toBeNull();
    expect(trackForCircuit(learned, "APPROACH")).toBeNull();
    expect(trackForCircuit(learned, "MOSTLY")).toBe("7");
    expect(trackForCircuit(learned, "UNKNOWN")).toBeNull();
    expect(summarizeCircuit(learned, "APPROACH")).toEqual({ circuit: "APPROACH", total: 11, tracks: [{ track: "3", count: 6 }, { track: "4", count: 5 }], platform: null });
  });

  it("positions unposted running trains without any history, adding the platform only when history names one", () => {
    const readings = new Map([["1", reading("P9")], ["2", reading("P5")], ["3", reading("P9")], ["4", reading("P9")], ["6", reading("NEW", false)]]);
    const result = withTrainPositions([
      { ...base, trainNumber: "1" },
      { ...base, trainNumber: "2", track: "7" },
      { ...base, trainNumber: "3", status: "cancelled" },
      { ...base, trainNumber: "4", status: "departed" },
      { ...base, trainNumber: "5" },
      { ...base, trainNumber: "6" },
    ], readings, table({ P9: { "9": 20 } }));
    expect(result.map((d) => d.position)).toEqual([
      { circuit: "P9", atPenn: true, updatedAt: null, historyTrack: "9" },
      undefined, undefined, undefined, undefined,
      { circuit: "NEW", atPenn: false, updatedAt: null },
    ]);
  });

  it("parses HGETALL replies and skips malformed fields", () => {
    const parsed = parseCircuitTable([circuitField("P9", "9"), "12", "garbage", "3", circuitField("P9", "8"), "x", circuitField("P5", "5"), "2"]);
    expect([...parsed.get("P9")!]).toEqual([["9", 12]]);
    expect([...parsed.get("P5")!]).toEqual([["5", 2]]);
    expect(parsed.has("garbage")).toBe(false);
    expect(parseCircuitTable(null).size).toBe(0);
  });
});
