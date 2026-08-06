"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/departures";
import { useClockFormat } from "@/lib/clockFormat";
import { getBoardListing } from "@/lib/boardDirectory";
import { subwayBoardChoice } from "@/lib/boardChoices";
import { subwayRouteColor, type SubwayTrip } from "@/lib/subway";
import { FreshnessWarning } from "./FreshnessWarning";

/** Matches the board's cadence; these are clock times, so no local tick. */
const REFRESH_MS = 30_000;
/** MTA's own disclosure threshold for data lagging its source. */
const STALE_AFTER_MS = 60_000;

type Status = "loading" | "ready" | "missing" | "error";

/**
 * One exact Subway train's remaining route.
 *
 * Everything on screen is live: the feed publishes only the calls the train
 * has still to make, so the list starts wherever the train is now and the app
 * never reconstructs where it has been.
 */
export function SubwayStopList({ tripId }: { tripId: string }) {
  const [trip, setTrip] = useState<SubwayTrip | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [stale, setStale] = useState(false);
  const { use24Hour } = useClockFormat();
  const loadedOnce = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(
        `/api/subway/trips/${encodeURIComponent(tripId)}`,
        { signal, cache: "no-store" },
      );
      // A train that has finished its run leaves the feed entirely.
      if (response.status === 404) {
        setStatus("missing");
        return;
      }
      if (!response.ok) throw new Error(String(response.status));

      const data: SubwayTrip = await response.json();
      setTrip(data);
      setStatus("ready");
      setStale(Date.now() - Date.parse(data.sourceTimestamp) > STALE_AFTER_MS);
      loadedOnce.current = true;
    } catch (error) {
      if (signal?.aborted) return;
      console.error(`Could not load Subway trip ${tripId}:`, error);
      // Keep the last good route on screen and mark it stale rather than
      // blanking the page underground.
      if (loadedOnce.current) setStale(true);
      else setStatus("error");
    }
  }, [tripId]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  if (status === "loading" && !trip) {
    return <p className="px-5 py-16 text-center text-muted">Loading this train…</p>;
  }

  if (status === "error" && !trip) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="font-medium">Couldn&apos;t load this train.</p>
        <p className="mt-1 text-sm text-muted">MTA realtime data may be unavailable.</p>
        <button
          type="button"
          className="mt-5 rounded-full border border-edge px-4 py-2 text-sm font-medium transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          onClick={() => { setStatus("loading"); void load(); }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === "missing" || !trip) {
    return (
      <p className="px-5 py-16 text-center text-muted">
        This train is no longer running. MTA has stopped publishing it.
      </p>
    );
  }

  const color = subwayRouteColor(trip.route);
  return (
    <>
      {stale && <FreshnessWarning lastLiveAt={Date.parse(trip.sourceTimestamp)} />}

      {/* The route's own identity, in MTA's terms. The internal trip id that
          addresses this train is never rider-facing text. */}
      <div className="flex items-center gap-3 border-b border-edge px-4 py-3 sm:px-5">
        <span
          aria-label={`${trip.route} train`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {trip.route}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{trip.destination}</span>
          <span className="block truncate text-sm text-muted">{trip.direction}</span>
        </span>
      </div>

      <p className="border-b border-edge px-4 py-2 text-xs font-medium text-muted sm:px-5">
        {trip.stops.length} {trip.stops.length === 1 ? "stop" : "stops"} remaining
      </p>

      <ol className="py-1" aria-label="Remaining stops">
        {trip.stops.map((stop, index) => (
          <li key={`${stop.id}-${index}`} className="relative flex items-center gap-3 py-2.5 pl-4 pr-3 sm:pl-5">
            <span
              aria-hidden
              className={`absolute left-[21px] w-0.5 sm:left-[25px] ${index === 0 ? "top-1/2" : "top-0"} ${index === trip.stops.length - 1 ? "bottom-1/2" : "bottom-0"}`}
              style={{ backgroundColor: color }}
            />
            <span
              aria-hidden
              className="relative z-10 h-3 w-3 shrink-0 rounded-full border-2 bg-surface"
              style={{ borderColor: color }}
            />
            <span className="min-w-0 flex-1">
              <StopName id={stop.id} name={stop.name} />
            </span>
            <span className="shrink-0 text-right text-sm tabular-nums text-muted sm:text-base">
              {stop.time ? (
                formatClock(stop.time, { hour12: !use24Hour })
              ) : (
                <span className="text-faint" aria-label="No estimate yet">–</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Links a stop to its own board when this build knows one. */
function StopName({ id, name }: { id: string; name: string }) {
  const listing = getBoardListing(subwayBoardChoice(id));
  return listing ? (
    <Link
      href={listing.href}
      className="block truncate rounded transition-colors hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
    >
      {name}
    </Link>
  ) : (
    <span className="block truncate">{name}</span>
  );
}
