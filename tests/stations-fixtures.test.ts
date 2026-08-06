import { describe, expect, it, vi } from "vitest";
import { fixtureDepartures } from "@/lib/fixtures";
import { distanceKm, getStation, lineColor, lineName, normalizeStationName } from "@/lib/stations";

describe("station directory contract", () => {
  it("looks up codes, folds names for search, and supplies display fallbacks", () => {
    expect(getStation("ny")?.name).toBe("New York Penn Station");
    expect(normalizeStationName("Glen Rock-Boro Hall")).toBe("glen rock boro hall");
    expect(lineName("ZZ")).toBe("ZZ"); expect(lineColor("ZZ")).toBe("#6B7280");
  });
  it("calculates great-circle distance", () => {
    expect(distanceKm(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
    const ny = getStation("NY")!; expect(distanceKm(ny.lat, ny.lng, ny.lat, ny.lng)).toBe(0);
  });
});
describe("fixture contract", () => {
  it("returns API-shaped, station-specific time-relative records", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2024-05-30T15:00:00Z"));
    const ny = fixtureDepartures("ny"); expect(ny.some((departure) => departure.TRAIN_ID === "A187")).toBe(true); expect(ny[0].SCHED_DEP_DATE).toBe("30-May-2024 11:03:00 AM"); expect(fixtureDepartures("other")).toHaveLength(4); vi.useRealTimers();
  });
});
