import { describe, expect, it } from "vitest";
import {
  directionGroups,
  normalizeDepartures,
  type RawDeparture,
} from "@/lib/departures";
import type { RawStationScheduleDeparture } from "@/lib/njtSchedule";
import livePayload from "./fixtures/njt-live-departures.json";
import schedulePayload from "./fixtures/njt-station-schedule.json";

const live = (overrides: Partial<RawDeparture> = {}): RawDeparture => ({
  SCHED_DEP_DATE: "30-May-2024 11:56:00 AM",
  DESTINATION: "Trenton",
  TRACK: "5",
  LINE: "Northeast Corridor Line",
  LINECODE: "NE",
  LINEABBREVIATION: "NEC",
  TRAIN_ID: "1234",
  CONNECTING_TRAIN_ID: "",
  STATUS: "in 5 Min",
  SEC_LATE: "0",
  INLINEMSG: "",
  ...overrides,
});

const scheduled = (
  overrides: Partial<RawStationScheduleDeparture> = {},
): RawStationScheduleDeparture => ({
  SCHED_DEP_DATE: "30-May-2024 11:56:00 AM",
  TRAIN_ID: "1234",
  DIRECTION: "Eastbound",
  PERM_CONNECTING_TRAIN_ID: "",
  ...overrides,
});

describe("NJT direction enrichment", () => {
  it("enriches captured live station calls only when the daily payload identifies them", () => {
    const departures = normalizeDepartures(
      livePayload.ITEMS,
      schedulePayload[0]!.ITEMS,
    );

    expect(departures.map(({ trainNumber, direction }) => ({ trainNumber, direction }))).toEqual([
      { trainNumber: "3861", direction: "Eastbound" },
      { trainNumber: "3501", direction: "Westbound" },
      { trainNumber: "9999", direction: undefined },
    ]);
  });

  it("matches the NJCL permanent connection identity from captured live and daily records", () => {
    const departures = normalizeDepartures(
      [livePayload.ITEMS[1]!],
      [schedulePayload[0]!.ITEMS[1]!],
    );

    expect(departures[0]?.direction).toBe("Westbound");
  });

  it("matches the current daily endpoint's connecting-train field", () => {
    const departures = normalizeDepartures(
      [live({ TRAIN_ID: "3501", CONNECTING_TRAIN_ID: "3247" })],
      [scheduled({ TRAIN_ID: "3247", CONNECTING_TRAIN_ID: "3501" })],
    );

    expect(departures[0]?.direction).toBe("Eastbound");
  });

  it("does not infer a direction from unrecognised schedule wording", () => {
    const departures = normalizeDepartures(
      [live()],
      [scheduled({ DIRECTION: "Northbound" })],
    );

    expect(departures[0]?.direction).toBeUndefined();
  });

  it("keeps both official groups while leaving unmatched live departures ungrouped", () => {
    const departures = normalizeDepartures(livePayload.ITEMS, schedulePayload[0]!.ITEMS);

    expect(directionGroups(departures)).toEqual([
      { label: "Eastbound", departures: [expect.objectContaining({ trainNumber: "3861" })] },
      { label: "Westbound", departures: [expect.objectContaining({ trainNumber: "3501" })] },
    ]);
    expect(departures.filter((departure) => !departure.direction)).toEqual([
      expect.objectContaining({ trainNumber: "9999" }),
    ]);
  });
});
