"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeparturesResponse } from "@/app/api/departures/[code]/route";
import {
  materialWatchChanges,
  pollWatchedStations,
  shouldSendBrowserNotification,
  watchAlertId,
  watchChangeMessage,
  type WatchChange,
} from "@/lib/watchMonitor";
import { reconcileStationWatches, useWatches } from "@/lib/watches";

const POLL_MS = 30_000;

type WatchAlert = WatchChange & { id: string; message: string };

/**
 * The open-page Client watcher polls every station represented in the local
 * Watch registry. It deliberately has no visibility gate or server-side work.
 */
export function WatchMonitor() {
  const { watches, loaded } = useWatches();
  const [alerts, setAlerts] = useState<WatchAlert[]>([]);

  const surfaceChange = useCallback((change: WatchChange) => {
    const message = watchChangeMessage(change);
    const BrowserNotification = window.Notification;
    if (shouldSendBrowserNotification(document.visibilityState, BrowserNotification?.permission)) {
      new BrowserNotification("Watch update", { body: message });
      return;
    }

    setAlerts((current) => [...current, {
      ...change,
      id: watchAlertId(change),
      message,
    }]);
  }, []);

  const poll = useCallback(async (signal?: AbortSignal) => {
    const snapshot = watches;
    if (snapshot.length === 0) return;

    await pollWatchedStations(snapshot, async (stationCode) => {
      const response = await fetch(`/api/departures/${stationCode}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(String(response.status));

      const data: DeparturesResponse = await response.json();
      const fromCache = response.headers.get("X-From-Cache") === "1";
      return {
        departures: data.departures,
        live: !data.fixtures && !fromCache,
      };
    }).then((results) => {
      if (signal?.aborted) return;
      for (const { stationCode, response } of results) {
        if (!response.live) continue;
        for (const change of materialWatchChanges(snapshot, stationCode, response.departures)) {
          surfaceChange(change);
        }
        reconcileStationWatches(stationCode, response.departures, { live: true });
      }
    }).catch((error: unknown) => {
      if (signal?.aborted) return;
      console.error("Could not monitor Watches:", error);
    });
  }, [surfaceChange, watches]);

  useEffect(() => {
    if (!loaded || watches.length === 0) return;
    const controller = new AbortController();
    void poll(controller.signal);
    // Watches keep monitoring when a tab is backgrounded; this only ends when
    // the component (and thus the open webpage) closes.
    const interval = window.setInterval(() => void poll(controller.signal), POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [loaded, poll, watches.length]);

  if (alerts.length === 0) return null;

  return (
    <section
      aria-label="Watch alerts"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md space-y-2"
    >
      {alerts.map((alert) => (
        <div
          key={alert.id}
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-warn bg-warn-soft px-4 py-3 text-sm text-text shadow-lg"
        >
          <p className="min-w-0 flex-1 font-medium">{alert.message}</p>
          <button
            type="button"
            className="shrink-0 text-sm font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            aria-label="Dismiss Watch alert"
            onClick={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))}
          >
            Dismiss
          </button>
        </div>
      ))}
    </section>
  );
}
