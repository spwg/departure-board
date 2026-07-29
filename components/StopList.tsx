"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StopsResponse } from "@/app/api/stops/[train]/route";
import { formatClock } from "@/lib/departures";
import { responseLiveTime } from "@/lib/freshness";
import { useClockFormat } from "@/lib/clockFormat";
import { getStation, lineColor, lineName } from "@/lib/stations";
import type { Stop, StopList as StopListData } from "@/lib/stops";
import { FreshnessWarning } from "./FreshnessWarning";

/**
 * Matches the board's cadence. There is no local tick alongside it the way the
 * board has: these are clock times, not countdowns, so nothing goes stale
 * between fetches.
 */
const REFRESH_MS = 30_000;

type Status = "loading" | "ready" | "missing" | "error";

export function StopList({ train, from }: { train: string; from: string }) {
  const [stopList, setStopList] = useState<StopListData | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [fixtures, setFixtures] = useState(false);
  const [stale, setStale] = useState(false);
  const [lastLiveAt, setLastLiveAt] = useState<number | null>(null);
  const { use24Hour } = useClockFormat();

  // Held in a ref so the polling effect does not restart on every render.
  const loadedOnce = useRef(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(
          `/api/stops/${encodeURIComponent(train)}`,
          { signal, cache: "no-store" },
        );
        // A train that has finished its run drops out of the feed entirely.
        if (response.status === 404) {
          setStatus("missing");
          return;
        }
        if (!response.ok) throw new Error(String(response.status));

        const data: StopsResponse = await response.json();
        const fromCache = response.headers.get("X-From-Cache") === "1";
        setStopList(data.stopList);
        setStatus("ready");
        setFixtures(data.fixtures);
        setStale(fromCache);
        setLastLiveAt(
          data.fixtures
            ? null
            : fromCache
              ? responseLiveTime(response)
              : Date.now(),
        );
        loadedOnce.current = true;
      } catch {
        if (signal?.aborted) return;
        // Keep the last good list on screen and mark it stale rather than
        // blanking the page on a platform with bad signal.
        if (loadedOnce.current) setStale(true);
        else setStatus("error");
      }
    },
    [train],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Every setState inside `load` runs after an await, so this cannot cascade
    // renders the way the rule guards against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);

    const poll = window.setInterval(() => {
      // Polling a page nobody is looking at wastes NJT's daily quota.
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

  if (status === "loading") return <StopsSkeleton />;

  if (status === "error") {
    return (
      <div className="px-5 py-16 text-center">
        <p className="font-medium text-text">Couldn&apos;t load stops.</p>
        <p className="mt-1 text-sm text-muted">
          NJ Transit may be unavailable. Check your connection and try again.
        </p>
        <button
          type="button"
          className="mt-5 rounded-full border border-edge px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          onClick={() => {
            setStatus("loading");
            void load();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === "missing" || !stopList || stopList.stops.length === 0) {
    return (
      <p className="px-5 py-16 text-center text-muted">
        No stops listed for this train right now.
      </p>
    );
  }

  const color = lineColor(stopList.lineCode);

  return (
    <>
      {(stale || fixtures) && (
        stale && lastLiveAt !== null ? (
          <FreshnessWarning lastLiveAt={lastLiveAt} />
        ) : (
          <p
            role="status"
            className="border-b border-edge bg-warn-soft px-5 py-2 text-center text-xs font-medium text-warn"
          >
            Sample data — add NJ Transit API credentials for live stops
          </p>
        )
      )}

      <div className="flex items-center gap-2 border-b border-edge px-4 py-3 text-sm sm:px-5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="min-w-0 truncate text-muted">
          {lineName(stopList.lineCode)}
          {stopList.destination ? ` · to ${stopList.destination}` : ""}
        </span>
      </div>

      {stopList.transferAt && (
        <p className="border-b border-edge bg-warn-soft px-4 py-2 text-xs font-medium text-warn sm:px-5">
          Change at {stopList.transferAt} to complete this trip.
        </p>
      )}

      {/* Times are estimates, not timetable times — the feed calls this field
          an ETA — so the column is labelled as one rather than left to imply
          a booked arrival. */}
      <ol
        className="py-1"
        aria-label={`Stops for train ${stopList.trainNumber || train}`}
      >
        {stopList.stops.map((stop, index) => (
          <StopRow
            key={`${stop.code}-${index}`}
            stop={stop}
            color={color}
            here={Boolean(from) && stop.code === from.toUpperCase()}
            first={index === 0}
            last={index === stopList.stops.length - 1}
            use24Hour={use24Hour}
          />
        ))}
      </ol>
    </>
  );
}

function StopRow({
  stop,
  color,
  here,
  first,
  last,
  use24Hour,
}: {
  stop: Stop;
  color: string;
  here: boolean;
  first: boolean;
  last: boolean;
  use24Hour: boolean;
}) {
  // Through-running trains call at stations outside NJ Transit's own list, so
  // only link the ones that have a board of their own.
  const station = getStation(stop.code);

  const name = (
    <span
      className={`truncate ${here ? "font-semibold" : ""} ${
        stop.departed ? "text-faint" : ""
      }`}
    >
      {stop.name}
    </span>
  );

  return (
    <li className="relative flex items-center gap-3 py-2.5 pl-4 pr-3 sm:pl-5">
      {/* The rail: stops short at both ends so the line begins and finishes on
          a dot rather than running off into the header and the page below. */}
      <span
        aria-hidden
        className={`absolute left-[21px] w-0.5 sm:left-[25px] ${
          first ? "top-1/2" : "top-0"
        } ${last ? "bottom-1/2" : "bottom-0"}`}
        style={{ backgroundColor: color, opacity: stop.departed ? 0.35 : 1 }}
      />

      <span
        aria-hidden
        className={`relative z-10 shrink-0 rounded-full border-2 ${
          here ? "h-3.5 w-3.5" : "h-3 w-3"
        } ${stop.departed || here ? "" : "bg-surface"}`}
        style={{
          borderColor: color,
          backgroundColor: stop.departed || here ? color : undefined,
          opacity: stop.departed ? 0.35 : 1,
        }}
      />

      <div className="min-w-0 flex-1">
        {station ? (
          <Link
            href={`/station/${station.code}`}
            className="flex min-w-0 items-baseline gap-2 rounded transition-colors hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            {name}
          </Link>
        ) : (
          <span className="flex min-w-0">{name}</span>
        )}

        {(here || stop.pickupOnly || stop.dropoffOnly) && (
          <div className="mt-0.5 truncate text-xs text-muted">
            {here
              ? "You are here"
              : stop.pickupOnly
                ? "Picks up only"
                : "Drops off only"}
          </div>
        )}
      </div>

      <div
        className={`shrink-0 text-right text-sm tabular-nums sm:text-base ${
          stop.departed ? "text-faint" : here ? "font-semibold" : "text-muted"
        }`}
      >
        {stop.time ? (
          formatClock(stop.time, { hour12: !use24Hour })
        ) : (
          // No estimate this far down the line yet.
          <span className="text-faint" aria-label="No estimate yet">
            –
          </span>
        )}
      </div>
    </li>
  );
}

function StopsSkeleton() {
  return (
    <ul className="py-1" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 py-2.5 pl-4 pr-3 sm:pl-5">
          <div className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-edge" />
          <div className="h-4 flex-1 animate-pulse rounded bg-edge" style={{ maxWidth: `${45 + ((i * 13) % 30)}%` }} />
          <div className="h-4 w-12 shrink-0 animate-pulse rounded bg-edge" />
        </li>
      ))}
    </ul>
  );
}
