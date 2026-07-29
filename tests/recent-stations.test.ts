import { afterEach, describe, expect, it } from "vitest";
import { recordRecentStation } from "@/lib/recentStations";

afterEach(() => {
  window.localStorage.clear();
});

describe("recent station preference", () => {
  it("persists at most five distinct opened stations, newest first", () => {
    for (const code of ["AM", "AB", "AZ", "AH", "AS", "AN", "AM"]) {
      recordRecentStation(code);
    }

    expect(JSON.parse(window.localStorage.getItem("departure-board:recent-stations")!)).toEqual([
      "AM",
      "AN",
      "AS",
      "AH",
      "AZ",
    ]);
  });
});
