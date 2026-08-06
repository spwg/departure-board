"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { subwayRouteColor, type SubwayBoard as Board } from "@/lib/subway";
import { FreshnessWarning } from "./FreshnessWarning";
import { DestinationFilter, useDestinationFilter } from "./DestinationFilter";

const REFRESH_MS = 30_000;
const OVERVIEW_DEPARTURES_PER_DIRECTION = 3;

export function SubwayBoard({ stationId }: { stationId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const directionParam = searchParams.get("direction");
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

  const directionUrl = (direction: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (direction) params.set("direction", direction);
    else params.delete("direction");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  if (!board) return failed ? (
    <div className="px-5 py-16 text-center">
      <p className="font-medium">Couldn&apos;t load departures.</p>
      <p className="mt-1 text-sm text-muted">MTA realtime data may be unavailable.</p>
      <button className="mt-5 rounded-full border border-edge px-4 py-2 text-sm font-medium" onClick={() => { setFailed(false); void load(); }}>Try again</button>
    </div>
  ) : <p className="px-5 py-16 text-center text-muted">Loading live departures…</p>;

  const visibleDepartures = board.departures.filter((departure) =>
    destinationFilter.matches({
      id: departure.destinationId ?? departure.destination,
      label: departure.destination,
    }),
  );
  const groups = [...new Set(visibleDepartures.map((departure) => departure.direction))].map((direction) => ({
    direction,
    departures: visibleDepartures.filter((departure) => departure.direction === direction),
  }));
  const focusedDirection = groups.some((group) => group.direction === directionParam)
    ? directionParam
    : null;
  const visibleGroups = focusedDirection
    ? groups.filter((group) => group.direction === focusedDirection)
    : groups;
  return <>
    {stale && <FreshnessWarning lastLiveAt={Date.parse(board.sourceTimestamp)} />}
    <DestinationFilter
      options={destinationFilter.options}
      selected={destinationFilter.selected}
      onToggle={destinationFilter.toggle}
      onClear={destinationFilter.clear}
    />
    {focusedDirection && (
      <button
        type="button"
        onClick={() => router.replace(directionUrl(null), { scroll: false })}
        className="flex w-full items-center gap-2 border-b border-edge bg-surface px-5 py-3 text-sm font-semibold text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current"
      >
        <span aria-hidden>←</span>
        All directions
      </button>
    )}
    {groups.length === 0 ? <p className="px-5 py-16 text-center text-muted">No live departures available.</p> : visibleGroups.map((group) => (
      <DirectionSection
        key={group.direction}
        direction={group.direction}
        departures={group.departures}
        now={now}
        focused={focusedDirection === group.direction}
        onFocus={() => router.push(directionUrl(group.direction), { scroll: false })}
      />
    ))}
  </>;
}

function DirectionSection({
  direction,
  departures,
  now,
  focused,
  onFocus,
}: {
  direction: string;
  departures: Board["departures"];
  now: number;
  focused: boolean;
  onFocus: () => void;
}) {
  const listId = `subway-${direction}-departures`;
  const hasMore = departures.length > OVERVIEW_DEPARTURES_PER_DIRECTION;
  const visible = focused ? departures : departures.slice(0, OVERVIEW_DEPARTURES_PER_DIRECTION);
  return (
    <section aria-labelledby={`subway-${direction}`}>
      <h2 id={`subway-${direction}`} className="border-y border-edge bg-bg px-5 py-2 text-sm font-semibold">{direction}</h2>
      <ul id={listId} className="divide-y divide-edge">{visible.map((departure) => (
        <SubwayRow key={departure.id} departure={departure} now={now} />
      ))}</ul>
      {!focused && hasMore && (
        <button
          type="button"
          aria-controls={listId}
          onClick={onFocus}
          className="w-full border-t border-edge bg-surface px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current"
        >
          View all {departures.length} {direction} trains
        </button>
      )}
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
  return <li className="flex items-center gap-4 px-5 py-4">
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
  </li>;
}
