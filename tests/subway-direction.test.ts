import { describe, expect, it } from "vitest";
import { directionBoardParent } from "@/app/subway/station/[stationId]/[direction]/page";
import { interchangeForStation } from "@/lib/interchanges";

describe("Subway direction breadcrumbs", () => {
  it("returns to the exact transfer node and preserves its transfer context", () => {
    const parent = directionBoardParent({
      stationName: "34 St-Penn Station",
      boardStationId: "128",
      interchange: interchangeForStation("subway", "128"),
      after: "njt|1234",
    });

    expect(parent).toEqual({
      label: "New York Penn Station 1/2/3",
      href: "/interchange/penn/123?after=njt%7C1234",
    });
  });

  it("keeps ordinary Subway boards on their station route", () => {
    expect(directionBoardParent({
      stationName: "Times Sq-42 St",
      boardStationId: "127",
      interchange: null,
    })).toEqual({
      label: "Times Sq-42 St Subway",
      href: "/subway/station/127",
    });
  });
});
