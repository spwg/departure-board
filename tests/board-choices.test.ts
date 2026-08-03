import { describe, expect, it } from "vitest";
import {
  boardChoiceKey,
  njtBoardChoice,
  normalizeBoardChoice,
  parseBoardChoice,
} from "@/lib/boardChoices";

describe("station-board choice identity", () => {
  it("keeps a provider system alongside its station identity", () => {
    const choice = njtBoardChoice("ny");

    expect(choice).toEqual({ system: "njt", stationId: "NY" });
    expect(boardChoiceKey(choice)).toBe("njt:NY");
  });

  it("migrates a legacy NJT station code while accepting qualified choices", () => {
    expect(parseBoardChoice("NY")).toEqual({ system: "njt", stationId: "NY" });
    expect(parseBoardChoice("subway:127")).toEqual({ system: "subway", stationId: "127" });
    expect(parseBoardChoice("bus:NY")).toBeNull();
    expect(normalizeBoardChoice("ny")).toEqual({ system: "njt", stationId: "NY" });
  });
});
