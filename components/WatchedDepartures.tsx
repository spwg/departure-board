"use client";

import { formatClock } from "@/lib/departures";
import { useClockFormat } from "@/lib/clockFormat";
import { useWatches, type Watch } from "@/lib/watches";
import { getStation } from "@/lib/stations";

function stationName(watch: Watch): string {
  return getStation(watch.stationCode)?.name ?? watch.stationCode;
}

/** The home-page control centre for all Watches, including other stations. */
export function WatchedDepartures() {
  const { watches, loaded, unwatch } = useWatches();
  const { use24Hour } = useClockFormat();
  if (!loaded || watches.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="mb-2 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Watched departures
        </h2>
      </div>
      <ul className="divide-y divide-edge overflow-hidden rounded-xl border border-edge bg-surface">
        {watches.map((watch) => {
          const name = stationName(watch);
          return (
            <li key={`${watch.stationCode}-${watch.trainNumber}-${watch.scheduledTime}`} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{watch.destination}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {name} · #{watch.trainNumber}
                </p>
              </div>
              <div className="shrink-0 text-right text-sm font-medium">
                {watch.status === "cancelled"
                  ? "Cancelled"
                  : formatClock(watch.expectedTime, { hour12: !use24Hour })}
              </div>
              <button
                type="button"
                onClick={() => unwatch(watch)}
                aria-label={`Unwatch train ${watch.trainNumber} from ${name}`}
                className="shrink-0 rounded-full px-2 py-1 text-sm text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              >
                Unwatch
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
