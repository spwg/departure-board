import { describe, expect, it, vi } from "vitest";
import { normalizeStop, normalizeStopList, type RawStop, type RawStopList } from "@/lib/stops";

function stop(code: string, overrides: Partial<RawStop> = {}): RawStop {
  return {
    STATION_2CHAR: code,
    STATIONNAME: code,
    TIME: "01-Nov-2026 08:30:18 AM",
    PICKUP: "",
    DROPOFF: "",
    DEPARTED: "NO",
    STOP_STATUS: "",
    ...overrides,
  };
}

function list(STOPS: RawStop[]): RawStopList {
  return { TRAIN_ID: "7216", LINECODE: "NC", DESTINATION: "New York", TRANSFERAT: "Long Branch", STOPS };
}

describe("stop-list duplicate records", () => {
  it("reduces train 7216's repeated stretch from 33 records to 17 without reordering", () => {
    const codes = ["LB", "LS", "RB", "MI", "HZ", "AM", "CH", "PE", "WB", "AV", "RH", "LI", "EZ", "NA", "NP", "SE", "NY"];
    const original = codes.map((code, index) => stop(code, {
      TIME: `01-Nov-2026 08:${String(24 + index).padStart(2, "0")}:00 AM`,
      DEPARTED: index < 11 ? "YES" : "NO",
    }));
    const raw = list([...original, ...original.slice(1).map((item) => ({ ...item }))]);
    const before = structuredClone(raw);
    const report = vi.fn();
    const result = normalizeStopList(raw, report);
    expect(raw.STOPS).toHaveLength(33);
    expect(result.stops).toEqual(original.map(normalizeStop));
    expect(result.stops).toHaveLength(17);
    expect(result.transferAt).toBe("Long Branch");
    expect(report).toHaveBeenCalledExactlyOnceWith(16);
    expect(raw).toEqual(before);
  });

  it("leaves ordinary lists in feed order and resets duplicate tracking each call", () => {
    const raw = list([stop("NY"), stop("NP"), stop("LB")]);
    const report = vi.fn();
    const expected = raw.STOPS.map(normalizeStop);
    expect(normalizeStopList(raw, report).stops).toEqual(expected);
    expect(normalizeStopList(raw, report).stops).toEqual(expected);
    expect(report).not.toHaveBeenCalled();
  });

  it("matches normalized records, retaining the first occurrence", () => {
    const first = stop(" ls ", { STATIONNAME: "Little &amp; Silver", DEPARTED: "YES" });
    const duplicate = stop("LS", { STATIONNAME: "Little & Silver", DEPARTED: "true" });
    expect(normalizeStopList(list([first, stop("NY"), duplicate])).stops)
      .toEqual([normalizeStop(first), normalizeStop(stop("NY"))]);
  });

  it.each([
    { TIME: "01-Nov-2026 08:30:19 AM" },
    { TIME: "02-Nov-2026 08:30:18 AM" },
    { DEPARTED: "YES" },
    { PICKUP: "Pick Up Only" },
    { DROPOFF: "Discharge Only" },
    { STATIONNAME: "Different station name" },
  ])("preserves a repeat with a different time, name or rendered flag: %j", (overrides) => {
    const raw = list([stop("LS"), stop("LS", overrides)]);
    expect(normalizeStopList(raw).stops).toEqual(raw.STOPS.map(normalizeStop));
  });

  it.each([{ STATION_2CHAR: "" }, { TIME: "" }, { TIME: "invalid" }])(
    "preserves ambiguous repeated records: %j",
    (overrides) => {
      const item = stop("LS", overrides);
      expect(normalizeStopList(list([item, { ...item }])).stops).toHaveLength(2);
    },
  );

  it("still filters unnamed stops and accepts empty lists", () => {
    expect(normalizeStopList(list([stop("LS", { STATIONNAME: "" })])).stops).toEqual([]);
    expect(normalizeStopList(list([])).stops).toEqual([]);
  });
});
