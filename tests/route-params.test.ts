import { describe, expect, it } from "vitest";
import { isNjtTrainId } from "@/lib/departures";
import { decodeRouteParam } from "@/lib/routeParams";

describe("route params", () => {
  it("decodes leftover escapes and keeps a literal percent sign instead of throwing", () => {
    expect(decodeRouteParam("R20%2CR21")).toBe("R20,R21");
    expect(decodeRouteParam("Uptown & Queens")).toBe("Uptown & Queens");
    expect(decodeRouteParam("%")).toBe("%");
    expect(decodeRouteParam("100%")).toBe("100%");
  });
});

describe("NJ Transit train ids reached by URL", () => {
  it("accepts train numbers the board links to", () => {
    for (const id of ["3861", "1", "6647", " 3251 "]) expect(isNjtTrainId(id)).toBe(true);
  });

  it("turns away excluded trains and anything not shaped like a train number", () => {
    for (const id of ["", "A187", "S12", "X902", "3861/../x", "%", "12345678901", "38 61", "<script>"]) {
      expect(isNjtTrainId(id)).toBe(false);
    }
  });
});
