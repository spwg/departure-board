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

describe("NJ Transit train numbers reached by URL", () => {
  it("accepts plain numbers of up to four digits", () => {
    for (const id of ["1", "3861", "6647", "9999", " 3251 "]) expect(isNjtTrainId(id)).toBe(true);
  });

  it("turns away prefixed trains and anything else", () => {
    for (const id of ["", "A187", "S12", "X902", "12345", "38a1", "3861/../x", "%", "38 61", "-1", "3.5"]) {
      expect(isNjtTrainId(id)).toBe(false);
    }
  });
});
