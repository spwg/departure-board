import { describe, expect, it } from "vitest";
import { transferHref, transfersFromStop } from "@/lib/transfers";
import subwayTransfers from "@/lib/subway-transfers.json";

describe("station transfers", () => {
  it("supports same-system A/C/E to L transfers at 14 St", () => {
    const transfer = transfersFromStop("subway", "A31");
    expect(transfer?.from).toEqual({ system: "subway", stationId: "A31" });
    expect(transfer?.targets.map((target) => target.label)).toEqual(["L"]);
    expect(transfer && transferHref(transfer.targets[0]!.choice)).toBe("/subway/station/L01");
  });

  it("keeps Columbus Circle's 1 and A/C/B/D boards distinct", () => {
    expect(transfersFromStop("subway", "A24")?.targets.map((target) => target.label)).toEqual(["1"]);
    expect(transfersFromStop("subway", "125")?.targets.map((target) => target.label)).toEqual(["A/C/B/D"]);
  });

  it("offers both same-system and cross-provider targets at Penn", () => {
    expect(transfersFromStop("subway", "128")?.targets.map((target) => target.label)).toEqual(["NJT", "A/C/E"]);
    expect(transfersFromStop("subway", "A28")?.targets.map((target) => target.label)).toEqual(["NJT", "1/2/3"]);
  });

  it("uses MTA's directed transfer definitions for Times Sq", () => {
    expect(transfersFromStop("subway", "127")?.targets.map((target) => target.label)).toEqual([
      "7", "S", "A/C/E", "N/Q/R/W",
    ]);
  });

  it("exposes every directed Subway transfer in the vendored MTA source", () => {
    const expected = new Map<string, string[]>();
    for (const [from, to] of subwayTransfers) {
      expected.set(from, [...(expected.get(from) ?? []), to]);
    }

    for (const [from, targets] of expected) {
      expect(transfersFromStop("subway", from)?.targets.map((target) => target.choice.stationId))
        .toEqual(targets);
    }
  });
});
