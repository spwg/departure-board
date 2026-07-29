"use client";

import { useState } from "react";
import type { Departure } from "@/lib/departures";
import { useWatches } from "@/lib/watches";

/** Watches or unwatches one exact departure without navigating away from its board. */
export function WatchButton({
  stationCode,
  departure,
}: {
  stationCode: string;
  departure: Departure;
}) {
  const { isWatched, watch, unwatch, loaded } = useWatches();
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const key = {
    stationCode: stationCode.toUpperCase(),
    trainNumber: departure.trainNumber,
    scheduledTime: departure.scheduledTime,
  };
  const active = isWatched(key);
  const trainDescription = `train ${departure.trainNumber} to ${departure.destination}`;

  return (
    <>
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${active ? "Unwatch" : "Watch"} ${trainDescription}`}
      onClick={() => {
        if (active) unwatch(key);
        else {
          watch(stationCode, departure);
          if (window.Notification?.permission === "default") {
            setPermissionNotice("Watch alerts can notify you while this page stays open. Your browser will now ask for permission.");
            void window.Notification.requestPermission().then((permission) => {
              if (permission === "denied") {
                setPermissionNotice("Watch alerts will remain available in this page while it is open.");
              }
            });
          }
        }
      }}
      className="shrink-0 rounded-full border border-edge px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      style={{ visibility: loaded ? "visible" : "hidden" }}
    >
      {active ? "Watching" : "Watch"}
    </button>
    {permissionNotice && <p role="status" className="sr-only">{permissionNotice}</p>}
    </>
  );
}
