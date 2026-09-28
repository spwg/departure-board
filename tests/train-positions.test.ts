import { describe, expect, it } from "vitest";
import type { Departure } from "@/lib/departures";
import {
  circuitField,
  confidenceOf,
  confidencePercent,
  circuitObservations,
  isAtPenn,
  parseCircuitTable,
  readingsByTrain,
  summarizeCircuit,
  predictTrack,
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

  it("reads only the trains asked for when given a set", () => {
    const vehicles = [{ ID: "3861", ICS_TRACK_CKT: "P9" }, { ID: "6647", ICS_TRACK_CKT: "P5" }, { ID: " 1023 ", ICS_TRACK_CKT: "P2" }];
    expect([...readingsByTrain(vehicles, new Set(["3861", "1023"])).keys()]).toEqual(["3861", "1023"]);
    expect([...readingsByTrain(vehicles).keys()]).toEqual(["3861", "6647", "1023"]);
  });

  it("keeps history only for posted trains inside Penn that have not departed", () => {
    const readings = new Map([["1", reading("C1")], ["2", reading("C2")], ["3", reading("C3")], ["5", reading("SECAUCUS", false)]]);
    const observations = circuitObservations([
      { ...base, trainNumber: "1", track: "9" },
      { ...base, trainNumber: "2", track: "" },
      { ...base, trainNumber: "3", track: "4", status: "departed" },
      { ...base, trainNumber: "4", track: "5" },
      { ...base, trainNumber: "5", track: "6" },
    ], readings);
    expect(observations).toEqual([{ trainNumber: "1", circuit: "C1", track: "9", scheduledTime: base.scheduledTime }]);
  });

  it("predicts any circuit's most frequent track, with confidence growing with agreeing history", () => {
    const learned = table({ PLATFORM: { "9": 20 }, THIN: { "9": 1 }, APPROACH: { "3": 6, "4": 5 }, MOSTLY: { "7": 40, "8": 1 } });
    expect(predictTrack(learned, "PLATFORM")).toEqual({ track: "9", confidence: 21 / 22 });
    expect(predictTrack(learned, "THIN")).toEqual({ track: "9", confidence: 2 / 3 });
    expect(predictTrack(learned, "APPROACH")).toEqual({ track: "3", confidence: 7 / 13 });
    expect(predictTrack(learned, "MOSTLY")?.track).toBe("7");
    expect(predictTrack(learned, "UNKNOWN")).toBeNull();
    expect(summarizeCircuit(learned, "APPROACH")).toEqual({ circuit: "APPROACH", total: 11, tracks: [{ track: "3", count: 6 }, { track: "4", count: 5 }], prediction: { track: "3", confidence: 7 / 13 } });
  });

  it("keeps thin history uncertain and never shows certainty", () => {
    expect(confidencePercent(confidenceOf(1, 1))).toBe(67);
    expect(confidencePercent(confidenceOf(3, 3))).toBe(80);
    expect(confidencePercent(confidenceOf(19, 20))).toBe(91);
    expect(confidencePercent(confidenceOf(1000, 1000))).toBe(99);
  });

  it("positions unposted running trains without any history, adding a predicted track when the circuit has history", () => {
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
      { circuit: "P9", atPenn: true, updatedAt: null, predictedTrack: "9", confidence: 21 / 22 },
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
