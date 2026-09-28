import { describe, expect, it } from "vitest";
import { isNjtTrainId } from "@/lib/departures";

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
