import { describe, expect, it } from "vitest";
import { NjtCallBudgetError, createCallBudget } from "@/lib/njtCallBudget";
import { njtFailureResponse } from "@/lib/njtFailure";

describe("NJ Transit call budget", () => {
  it("allows a burst, then refills at the sustained rate", () => {
    let now = 0;
    const budget = createCallBudget({ burst: 3, perMinute: 6, now: () => now });
    for (let call = 0; call < 3; call += 1) budget.take();
    expect(() => budget.take()).toThrow(NjtCallBudgetError);

    now += 9_999;
    expect(() => budget.take()).toThrow(NjtCallBudgetError);
    now += 1;
    budget.take();
    expect(() => budget.take()).toThrow(NjtCallBudgetError);
  });

  it("never refills past the burst", () => {
    let now = 0;
    const budget = createCallBudget({ burst: 2, perMinute: 60, now: () => now });
    now += 60 * 60_000;
    budget.take();
    budget.take();
    expect(() => budget.take()).toThrow(NjtCallBudgetError);
  });

  it("says when the next call is allowed", () => {
    const now = 1_000;
    const budget = createCallBudget({ burst: 1, perMinute: 6, now: () => now });
    budget.take();
    try {
      budget.take();
      expect.unreachable();
    } catch (error) {
      expect((error as NjtCallBudgetError).retryAt).toBe(11_000);
    }
  });

  it("answers an exhausted budget with a retryable 503", async () => {
    const response = njtFailureResponse(new NjtCallBudgetError(Date.now() + 4_500));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(await response.json()).toMatchObject({ kind: "upstream" });
  });
});
