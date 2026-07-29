"use client";

import { useState } from "react";
import type { Departure } from "@/lib/departures";
import { useWatches } from "@/lib/watches";

/** Watches or unwatches one exact departure without navigating away from its board. */
export function WatchButton({
  stationCode,
  departure,
  className = "",
}: {
  stationCode: string;
  departure: Departure;
  className?: string;
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
      title={active ? "Stop watching departure" : "Watch departure"}
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
      className={`grid h-7 w-7 shrink-0 place-items-center rounded text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${
        active ? "text-text" : ""
      } ${className}`}
      style={{ visibility: loaded ? "visible" : "hidden" }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none" />
      </svg>
    </button>
    {permissionNotice && <p role="status" className="sr-only">{permissionNotice}</p>}
    </>
  );
}
