import { afterEach, describe, expect, it } from "vitest";
import { njtBoardChoice } from "@/lib/boardChoices";
import { recordRecentStation, recentStationChoices } from "@/lib/recentStations";

afterEach(() => {
  window.localStorage.clear();
});

describe("recent station preference", () => {
  it("migrates legacy NJT codes and persists at most five qualified choices, newest first", () => {
    window.localStorage.setItem("departure-board:recent-stations", JSON.stringify(["NY"]));
    for (const code of ["AM", "AB", "AZ", "AH", "AS", "AN", "AM"]) {
      recordRecentStation(njtBoardChoice(code));
    }

    expect(JSON.parse(window.localStorage.getItem("departure-board:recent-stations")!)).toEqual([
      "njt:AM",
      "njt:AN",
      "njt:AS",
      "njt:AH",
      "njt:AZ",
    ]);
    expect(recentStationChoices()).toEqual([
      { system: "njt", stationId: "AM" },
      { system: "njt", stationId: "AN" },
      { system: "njt", stationId: "AS" },
      { system: "njt", stationId: "AH" },
      { system: "njt", stationId: "AZ" },
    ]);
  });
});
