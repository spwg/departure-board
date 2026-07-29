import { afterEach, describe, expect, it } from "vitest";
import { recordRecentStation, removeRecentStation } from "@/lib/recentStations";

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

  it("removes only the selected station from the history", () => {
    for (const code of ["AM", "AB", "AZ"]) recordRecentStation(code);

    removeRecentStation("AB");

    expect(JSON.parse(window.localStorage.getItem("departure-board:recent-stations")!)).toEqual([
      "AZ", "AM",
    ]);
  });
});
