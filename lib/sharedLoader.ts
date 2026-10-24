/**
 * One upstream resource shared by every request an instance serves.
 *
 * A success is reused for `ttlMs`. Concurrent misses wait on one load rather
 * than each calling upstream. A failure is remembered for `failureBackoffMs`
 * and rethrown without calling again, so an upstream outage costs one call
 * per backoff rather than one per request, each of which could wait out a
 * timeout. Keep the backoff short: a one-off failure delays recovery by it.
 */
export function createSharedLoader<T>(
  load: () => Promise<T>,
  {
    ttlMs,
    failureBackoffMs,
    clock = Date.now,
  }: { ttlMs: number; failureBackoffMs: number; clock?: () => number },
): () => Promise<T> {
  let cached: { at: number; value: T } | null = null;
  let failed: { at: number; error: unknown } | null = null;
  let pending: Promise<T> | null = null;

  return async () => {
    const now = clock();
    if (cached && now - cached.at < ttlMs) return cached.value;
    if (failed && now - failed.at < failureBackoffMs) throw failed.error;

    pending ??= load()
      .then(
        (value) => {
          cached = { at: now, value };
          failed = null;
          return value;
        },
        (error: unknown) => {
          failed = { at: clock(), error };
          throw error;
        },
      )
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}
