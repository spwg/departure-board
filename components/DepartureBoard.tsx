"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DeparturesResponse } from "@/app/api/departures/[code]/route";
import type { Departure } from "@/lib/departures";
import { DepartureRow } from "./DepartureRow";

const REFRESH_MS = 30_000;
/** Countdowns tick locally between fetches so the board never looks frozen. */
const TICK_MS = 15_000;

export function DepartureBoard({ code }: { code: string }) {
  const [departures, setDepartures] = useState<Departure[] | null>(null);
  const [fixtures, setFixtures] = useState(false);
  const [stale, setStale] = useState(false);
  // Left at 0 until after mount: reading the clock during render is
  // non-deterministic and would break prerendering. Every path that supplies
  // departures also sets this, so no row is ever rendered against 0.
  const [now, setNow] = useState(0);

  // Held in a ref so the polling effect does not restart on every render.
  const loadedOnce = useRef(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/departures/${code}`, {
          signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(String(response.status));

        const data: DeparturesResponse = await response.json();
        setDepartures(data.departures);
        setFixtures(data.fixtures);
        // The service worker serves its cached copy when the network is gone.
        // Those times are old, so say so rather than showing them as current.
        setStale(response.headers.get("X-From-Cache") === "1");
        setNow(Date.now());
        loadedOnce.current = true;
      } catch {
        if (signal?.aborted) return;
        // Keep the last good board on screen and just mark it stale — a blank
        // page is worse than slightly old times when you are on a platform
        // with bad signal.
        if (loadedOnce.current) setStale(true);
        else setDepartures([]);
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

  if (departures === null) {
    return <BoardSkeleton />;
  }

  if (departures.length === 0) {
    return (
      <p className="px-5 py-16 text-center text-muted">
        No departures scheduled right now.
      </p>
    );
  }

  return (
    <>
      {(stale || fixtures) && (
        <p
          role="status"
          className="border-b border-edge bg-warn-soft px-5 py-2 text-center text-xs font-medium text-warn"
        >
          {stale
            ? "Offline — showing the last times we loaded"
            : "Sample data — add NJ Transit API credentials for live departures"}
        </p>
      )}
      <ul className="divide-y divide-edge">
        {departures.map((departure) => (
          <DepartureRow
            key={departure.id}
            departure={departure}
            now={now}
            stationCode={code}
          />
        ))}
      </ul>
    </>
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
