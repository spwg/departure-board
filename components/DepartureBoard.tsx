"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { DeparturesResponse } from "@/app/api/departures/[code]/route";
import { type Departure } from "@/lib/departures";
import { responseLiveTime } from "@/lib/freshness";
import { DepartureRow } from "./DepartureRow";
import { DestinationFilter, useDestinationFilter } from "./DestinationFilter";
import { FreshnessWarning } from "./FreshnessWarning";
import { ServiceStatus } from "./ServiceStatus";


const REFRESH_MS = 30_000;
/** Countdowns tick locally between fetches so the board never looks frozen. */
const TICK_MS = 15_000;

/**
 * Polls the station endpoint for `code`. Until a first result it shows loading
 * or a retryable error; later failures retain the last board and mark it stale.
 */
export function DepartureBoard({ code }: { code: string }) {
  const [departures, setDepartures] = useState<Departure[] | null>(null);
  const [fixtures, setFixtures] = useState(false);
  const [stale, setStale] = useState(false);
  const [lastLiveAt, setLastLiveAt] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Left at 0 until after mount: reading the clock during render is
  // non-deterministic and would break prerendering. Every path that supplies
  // departures also sets this, so no row is ever rendered against 0.
  const [now, setNow] = useState(0);

  // Held in a ref so the polling effect does not restart on every render.
  const loadedOnce = useRef(false);
  const destinationFilter = useDestinationFilter(
    departures?.map((departure) => ({
      id: departure.destinationId ?? departure.destination,
      label: departure.destination,
    })) ?? [],
    (id) => id.startsWith("njt:"),
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/departures/${code}`, {
          signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(String(response.status));

        const data: DeparturesResponse = await response.json();
        const fromCache = response.headers.get("X-From-Cache") === "1";
        setDepartures(data.departures);
        setFixtures(data.fixtures);
        setStale(fromCache);
        setLastLiveAt(
          data.fixtures
            ? null
            : fromCache
              ? responseLiveTime(response)
              : Date.now(),
        );
        setLoadFailed(false);
        setNow(Date.now());
        loadedOnce.current = true;
      } catch (error) {
        if (signal?.aborted) return;
        console.error(`Could not load departures for ${code}:`, error);
        // Keep the last good board on screen and just mark it stale — a blank
        // page is worse than slightly old times when you are on a platform
        // with bad signal.
        if (loadedOnce.current) setStale(true);
        else setLoadFailed(true);
      }
    },
    [code],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Every setState inside `load` runs after an await, so this cannot cascade
    // renders the way the rule guards against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);

    const poll = window.setInterval(() => {
      // Polling a board nobody is looking at wastes NJT's daily quota.
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);

    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      controller.abort();
      window.clearInterval(poll);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  let content: ReactNode;
  if (departures === null) {
    if (loadFailed) {
      content = (
        <div className="px-5 py-16 text-center">
          <p className="font-medium text-text">Couldn&apos;t load departures.</p>
          <p className="mt-1 text-sm text-muted">
            NJ Transit may be unavailable. Check your connection and try again.
          </p>
          <button
            type="button"
            className="mt-5 rounded-full border border-edge px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            onClick={() => {
              setLoadFailed(false);
              void load();
            }}
          >
            Try again
          </button>
        </div>
      );
    } else {
      content = <BoardSkeleton />;
    }
  } else if (departures.length === 0) {
    content = (
      <>
        {stale && lastLiveAt !== null && (
          <FreshnessWarning lastLiveAt={lastLiveAt} />
        )}
        <p className="px-5 py-16 text-center text-muted">
          No departures scheduled right now.
        </p>
      </>
    );
  } else {
    const visibleDepartures = departures.filter((departure) =>
      destinationFilter.matches({
        id: departure.destinationId ?? departure.destination,
        label: departure.destination,
      }),
    );
    content = (
      <>
        {(stale || fixtures) && (
          stale && lastLiveAt !== null ? (
            <FreshnessWarning lastLiveAt={lastLiveAt} />
          ) : (
            <p
              role="status"
              className="border-b border-edge bg-warn-soft px-5 py-2 text-center text-xs font-medium text-warn"
            >
              Sample data — add NJ Transit API credentials for live departures
            </p>
          )
        )}
        <DestinationFilter
          options={destinationFilter.options}
          selected={destinationFilter.selected}
          onToggle={destinationFilter.toggle}
          onClear={destinationFilter.clear}
        />
        {visibleDepartures.length === 0 ? (
          <p className="px-5 py-16 text-center text-muted">No live departures match this destination filter.</p>
        ) : (
          // One chronological sequence, no direction headings: the station's
          // own concourse board is flat and a rail rider scans it for the one
          // train they already have in mind.
          <DepartureList departures={visibleDepartures} now={now} stationCode={code} />
        )}
      </>
    );
  }

  return (
    <>
      <ServiceStatus stationCode={code} />
      {content}
    </>
  );
}

function DepartureList({
  departures,
  now,
  stationCode,
}: {
  departures: Departure[];
  now: number;
  stationCode: string;
}) {
  return (
    <ul className="divide-y divide-edge">
      {departures.map((departure) => (
        <DepartureRow
          key={departure.id}
          departure={departure}
          now={now}
          stationCode={stationCode}
        />
      ))}
    </ul>
  );
}

function BoardSkeleton() {
  return (
    <ul className="divide-y divide-edge" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center gap-4 py-4 pl-5 pr-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-5 w-2/5 animate-pulse rounded bg-edge" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-edge" />
          </div>
          <div className="h-5 w-14 animate-pulse rounded bg-edge" />
          <div className="h-11 w-11 animate-pulse rounded-xl bg-edge sm:h-12 sm:w-12" />
        </li>
      ))}
    </ul>
  );
}
