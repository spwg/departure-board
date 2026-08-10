import { describe, expect, it } from "vitest";
import { transferHref, transfersFromStop } from "@/lib/transfers";

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
});
