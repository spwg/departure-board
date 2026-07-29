"use client";

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
  const key = {
    stationCode: stationCode.toUpperCase(),
    trainNumber: departure.trainNumber,
    scheduledTime: departure.scheduledTime,
  };
  const active = isWatched(key);
  const trainDescription = `train ${departure.trainNumber} to ${departure.destination}`;

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${active ? "Unwatch" : "Watch"} ${trainDescription}`}
      onClick={() => {
        if (active) unwatch(key);
        else watch(stationCode, departure);
      }}
      className="shrink-0 rounded-full border border-edge px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      style={{ visibility: loaded ? "visible" : "hidden" }}
    >
      {active ? "Watching" : "Watch"}
    </button>
  );
}
