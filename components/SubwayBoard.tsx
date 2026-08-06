"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { subwayRouteColor, type SubwayBoard as Board } from "@/lib/subway";
import { FreshnessWarning } from "./FreshnessWarning";
import { DestinationFilter, useDestinationFilter } from "./DestinationFilter";

const REFRESH_MS = 30_000;

/**
 * `after` is a transfer cutoff: show only trains leaving strictly after an
 * instant. Nothing is judged catchable — every later departure is shown.
 */
export function SubwayBoard({ stationId, after = null }: { stationId: string; after?: number | null }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(0);
  const loaded = useRef(false);
  const destinationFilter = useDestinationFilter(
    board?.departures.map((departure) => ({
      id: departure.destinationId ?? departure.destination,
      label: departure.destination,
    })) ?? [],
    (id) => id.startsWith("mta:"),
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/subway/departures/${stationId}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error(String(response.status));
      const next: Board = await response.json();
      setBoard(next);
      setFailed(false);
      setStale(Date.now() - Date.parse(next.sourceTimestamp) > 60_000);
      setNow(Date.now());
      loaded.current = true;
    } catch (error) {
      if (signal?.aborted) return;
      console.error(`Could not load Subway departures for ${stationId}:`, error);
      if (loaded.current) setStale(true);
      else setFailed(true);
    }
  }, [stationId]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => { controller.abort(); window.clearInterval(poll); window.clearInterval(tick); };
  }, [load]);

  if (!board) return failed ? (
    <div className="px-5 py-16 text-center">
      <p className="font-medium">Couldn&apos;t load departures.</p>
      <p className="mt-1 text-sm text-muted">MTA realtime data may be unavailable.</p>
      <button className="mt-5 rounded-full border border-edge px-4 py-2 text-sm font-medium" onClick={() => { setFailed(false); void load(); }}>Try again</button>
    </div>
  ) : <p className="px-5 py-16 text-center text-muted">Loading live departures…</p>;

  const visibleDepartures = board.departures.filter(
    (departure) =>
      (after === null || Date.parse(departure.expectedTime) > after) &&
      destinationFilter.matches({
        id: departure.destinationId ?? departure.destination,
        label: departure.destination,
      }),
  );
  const groups = [...new Set(visibleDepartures.map((departure) => departure.direction))].map((direction) => ({
    direction,
    departures: visibleDepartures.filter((departure) => departure.direction === direction),
  }));
  return <>
    {stale && <FreshnessWarning lastLiveAt={Date.parse(board.sourceTimestamp)} />}
    <DestinationFilter
      options={destinationFilter.options}
      selected={destinationFilter.selected}
      onToggle={destinationFilter.toggle}
      onClear={destinationFilter.clear}
    />
    {groups.length === 0 ? (
      <p className="px-5 py-16 text-center text-muted">
        {after === null
          ? "No live departures available."
          : "No live departures yet for that arrival time."}
      </p>
    ) : groups.map((group) => (
      <DirectionSection
        key={group.direction}
        direction={group.direction}
        departures={group.departures}
        now={now}
      />
    ))}
  </>;
}

/**
 * One direction group, whole. Every train in it is on screen: the platform
 * sign's three-train rotation is the size of an LED panel, not a rider's
 * appetite, and hiding the train after the next one behind a tap was the wrong
 * lesson to draw from it.
 *
 * The heading pins to the top of the board while its own group scrolls, which
 * is what makes an uncapped group safe to read — a rider deep in a long list
 * can still see which direction they are looking at.
 */
function DirectionSection({
  direction,
  departures,
  now,
}: {
  direction: string;
  departures: Board["departures"];
  now: number;
}) {
  return (
    <section aria-labelledby={`subway-${direction}`}>
      <h2
        id={`subway-${direction}`}
        // Clears the station header, which is itself pinned on phones and
        // static from tablet up.
        className="sticky top-15 z-9 border-y border-edge bg-bg px-5 py-2 text-sm font-semibold sm:top-0"
      >
        {direction}
      </h2>
      <ul className="divide-y divide-edge">{departures.map((departure) => (
        <SubwayRow key={departure.id} departure={departure} now={now} />
      ))}</ul>
    </section>
  );
}

/**
 * One subway departure: route bullet, destination, next stop, countdown.
 *
 * No direction — the sticky heading above already says it — and no clock time,
 * which was the countdown's own instant printed a second way. The two facts a
 * boarding rider reads, destination and next stop, own all the flexible width.
 */
function SubwayRow({ departure, now }: { departure: Board["departures"][number]; now: number }) {
  const minutes = Math.max(0, Math.round((Date.parse(departure.expectedTime) - now) / 60_000));
  return <li>
    {/* The whole row opens this exact train's remaining route — one tap
        target, as on the rail board. */}
    <Link
      href={`/subway/train/${encodeURIComponent(departure.id)}`}
      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none"
    >
      <span aria-label={`${departure.route} train`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-bold text-white" style={{ backgroundColor: subwayRouteColor(departure.route) }}>{departure.route}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-semibold">{departure.destination}</span>
        <span className="mt-0.5 flex items-baseline gap-1.5 text-sm text-muted">
          <span className="shrink-0">Next stop</span>
          <span aria-hidden className="text-faint">·</span>
          <span className="truncate">{departure.nextStop}</span>
        </span>
      </span>
      <span className="shrink-0 text-lg font-semibold">{minutes === 0 ? "now" : `${minutes} min`}</span>
      <span className="sr-only">See remaining stops</span>
    </Link>
  </li>;
}
