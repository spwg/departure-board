/**
 * Caps how fast one app instance may call NJ Transit's data endpoints.
 *
 * RailData allows 40,000 data calls a day for the whole account, collector
 * included, and every station code and every 1–4 digit train number is a
 * distinct cache entry. Without a cap, one client looping over train numbers
 * could spend the day's allowance in minutes and leave every rider with errors
 * until midnight. A token bucket keeps normal bursts (opening a few boards at
 * once) free while holding the sustained rate below the daily allowance.
 *
 * The bucket is per instance, so it bounds damage rather than preventing it
 * outright; a platform rate limit on /api/ (see docs/security.md) is the first
 * line of defense.
 */

/** Calls a fresh instance may make at once. */
export const NJT_CALL_BURST = 40;
/**
 * Sustained calls per minute: 28,800 a day, which leaves room under 40,000 for
 * the collector's ~2,900 and a second instance's share of a burst.
 */
export const NJT_CALLS_PER_MINUTE = 20;

/** This instance has used its share of NJ Transit calls for now. */
export class NjtCallBudgetError extends Error {
  constructor(readonly retryAt: number) {
    super("NJ Transit call budget exhausted for this instance");
    this.name = "NjtCallBudgetError";
  }
}

export function createCallBudget({
  burst = NJT_CALL_BURST,
  perMinute = NJT_CALLS_PER_MINUTE,
  now = Date.now,
}: { burst?: number; perMinute?: number; now?: () => number } = {}) {
  const msPerCall = 60_000 / perMinute;
  let tokens = burst;
  let refilledAt = now();

  return {
    /** Spends one call, or throws NjtCallBudgetError when none is left. */
    take(): void {
      const at = now();
      tokens = Math.min(burst, tokens + (at - refilledAt) / msPerCall);
      refilledAt = at;
      if (tokens < 1) throw new NjtCallBudgetError(at + (1 - tokens) * msPerCall);
      tokens -= 1;
    },
  };
}
