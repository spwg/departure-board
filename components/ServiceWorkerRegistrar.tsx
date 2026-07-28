"use client";

import { useEffect } from "react";

/** Tested contract: registration is a production-only progressive enhancement. */

/**
 * Registers the offline service worker.
 *
 * Production only: a caching worker in development just serves stale bundles
 * and hides the changes you are trying to see.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is an enhancement; the app works fine without it.
    });
  }, []);

  return null;
}
