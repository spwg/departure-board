"use client";

import { useEffect } from "react";

const WATCH_REGISTRY_KEY = "departure-board:watches";

/**
 * Drops the Watch registry left behind in a returning rider's browser.
 *
 * Watches were retired in docs/adr/0002-retire-watches.md; nothing reads this
 * key any more, so all that is left is to stop carrying it around. It sits in
 * the root layout rather than on Home because a rider comes back to whichever
 * board they bookmarked. Delete this once returning riders no longer have one.
 */
export function RetiredWatchStateCleanup() {
  useEffect(() => {
    try {
      window.localStorage.removeItem(WATCH_REGISTRY_KEY);
    } catch {
      // Blocked storage. The registry is unread either way.
    }
  }, []);

  return null;
}
