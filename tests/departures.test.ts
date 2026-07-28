import { describe, expect, it } from "vitest";
import { decodeEntities, displayTrack, formatClock, isExcluded, normalizeDepartures, parseNjtDate, toStatus, type RawDeparture } from "@/lib/departures";

const item = (overrides: Partial<RawDeparture> = {}): RawDeparture => ({ SCHED_DEP_DATE: "30-May-2024 11:56:00 AM", DESTINATION: "Newark &amp; Airport", TRACK: " 5 ", LINE: "Northeast Corridor Line", LINECODE: "NE", LINEABBREVIATION: "NEC", TRAIN_ID: "1234", STATUS: "in 5 Min", SEC_LATE: "0", INLINEMSG: "", ...overrides });

describe("departure normalization contract", () => {
  it("decodes feed entities and preserves unknown entities", () => {
    expect(decodeEntities(" A&nbsp; &#x2708; &#9992 &madeup; ")).toBe("A ✈ ✈ &madeup;");
  });
  it("parses NJT timestamps as Eastern instants across DST", () => {
    expect(parseNjtDate("30-May-2024 11:56:00 AM")?.toISOString()).toBe("2024-05-30T15:56:00.000Z");
    expect(parseNjtDate("15-Jan-2024 11:56:00 AM")?.toISOString()).toBe("2024-01-15T16:56:00.000Z");
    expect(parseNjtDate("not a date")).toBeNull();
  });
  it("uses the browser's 12- or 24-hour clock preference", () => {
    const iso = "2024-05-30T23:04:00.000Z";
    expect(formatClock(iso, { locales: "en-US", hourCycle: "h12" })).toBe("7:04 PM");
    expect(formatClock(iso, { locales: "en-US", hourCycle: "h23" })).toBe("19:04");
  });
  it("filters excluded service and orders remaining departures by expected time", () => {
    const result = normalizeDepartures([item({ TRAIN_ID: "X9" }), item({ TRAIN_ID: "A9" }), item({ LINECODE: "SP" }), item({ TRAIN_ID: "late", SEC_LATE: "600", SCHED_DEP_DATE: "30-May-2024 11:50:00 AM" }), item({ TRAIN_ID: "board", SCHED_DEP_DATE: "30-May-2024 11:55:00 AM", STATUS: "ALL ABOARD" })]);
    expect(result.map((departure) => departure.trainNumber)).toEqual(["board", "late"]);
    expect(result[1]).toMatchObject({ destination: "Newark & Airport", track: "5", delayMinutes: 10, status: "delayed" });
  });
  it("maps operational status and safely cleans track values", () => {
    expect(displayTrack("  A ")).toBe("A");
    expect(isExcluded(item({ LINEABBREVIATION: "AMTK" }))).toBe(true);
    expect(toStatus("CANCELLED", 0)).toBe("cancelled"); expect(toStatus("departed", 0)).toBe("departed"); expect(toStatus("ALL ABOARD", 0)).toBe("boarding"); expect(toStatus("normal", 1)).toBe("delayed");
  });
});
