import { describe, expect, it } from "vitest";
import { isNjtTrainId } from "@/lib/departures";

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
