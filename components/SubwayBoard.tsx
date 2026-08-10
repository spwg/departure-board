"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { subwayRouteColor, type SubwayBoard as Board } from "@/lib/subway";
import { encodeTransferOrigin, type TransferOrigin } from "@/lib/transfers";
import { FreshnessWarning } from "./FreshnessWarning";

const REFRESH_MS = 30_000;

/**
 * `after` is a transfer cutoff: show only trains leaving strictly after an
 * instant. The main board shows the next three trains per direction; a
 * direction page passes `limit={null}` to show the full filtered list. A
 * transfer origin stays attached to direction links so its live arrival can
 * continue moving after navigation.
 */
export function SubwayBoard({
  stationId,
  after = null,
  direction,
  limit = 3,
  transferOrigin = null,
  expandComplex = true,
}: {
  stationId: string;
  after?: number | null;
  direction?: string;
  limit?: number | null;
  transferOrigin?: TransferOrigin | null;
  expandComplex?: boolean;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(0);
  const loaded = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const exactQuery = expandComplex ? "" : "?exact=true";
      const response = await fetch(`/api/subway/departures/${stationId}${exactQuery}`, { cache: "no-store", signal });
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
  }, [expandComplex, stationId]);

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
      after === null || Date.parse(departure.expectedTime) > after,
  );
  const groups = [...new Set(visibleDepartures.map((departure) => departure.direction))]
    .filter((groupDirection) => direction === undefined || groupDirection === direction)
    .map((groupDirection) => {
      const departures = visibleDepartures.filter((departure) => departure.direction === groupDirection);
      return {
        direction: groupDirection,
        visibleDepartures: limit === null ? departures : departures.slice(0, limit),
        hasMore: limit !== null && departures.length > limit,
      };
    });
  const visibleGroups = direction === undefined
    ? selectMainGroups(groups)
    : groups;
  return <>
    {stale && <FreshnessWarning lastLiveAt={Date.parse(board.sourceTimestamp)} />}
    {groups.length === 0 ? (
      <p className="px-5 py-16 text-center text-muted">
        {after === null
          ? "No live departures available."
          : "No live departures yet for that arrival time."}
      </p>
    ) : visibleGroups.map((group) => (
      <DirectionSection
        key={group.direction}
        stationId={stationId}
        direction={group.direction}
        departures={group.visibleDepartures}
        now={now}
        after={after}
        hasMore={group.hasMore}
        transferOrigin={transferOrigin}
      />
    ))}
  </>;
}

type DirectionGroup = {
  direction: string;
  visibleDepartures: Board["departures"];
  hasMore: boolean;
};

/** Keep the station board to the two directions a rider can scan at once. */
function selectMainGroups(groups: DirectionGroup[]): DirectionGroup[] {
  const named = groups.filter(({ direction }) => direction === "Uptown" || direction === "Downtown");
  return (named.length >= 2 ? named : groups).slice(0, 2);
}

/**
 * One direction group. The main station board keeps each group to a short,
 * scannable set and sends the rider to a dedicated page for the full list.
 *
 * The heading pins to the top of the board while its own group scrolls, which
 * is what makes an uncapped group safe to read — a rider deep in a long list
 * can still see which direction they are looking at.
 */
function DirectionSection({
  stationId,
  direction,
  departures,
  now,
  after,
  hasMore,
  transferOrigin,
}: {
  direction: string;
  stationId: string;
  departures: Board["departures"];
  now: number;
  after: number | null;
  hasMore: boolean;
  transferOrigin: TransferOrigin | null;
}) {
  return (
    <section aria-labelledby={`subway-${direction}`}>
      <h2
        id={`subway-${direction}`}
        // Clears the station header, which is itself pinned on phones and
        // static from tablet up.
        className="sticky top-[var(--subway-header-offset,4.625rem)] z-9 border-y border-edge bg-bg px-5 py-2 text-sm font-semibold sm:top-0"
      >
        {direction}
      </h2>
      <ul className="divide-y divide-edge">{departures.map((departure) => (
        <SubwayRow key={departure.id} departure={departure} now={now} />
      ))}</ul>
      {hasMore && (
        <div className="border-t border-edge px-5 py-3">
          <Link
            href={directionHref(stationId, direction, after, transferOrigin)}
            className="block rounded-lg px-3 py-2 text-center text-sm font-semibold text-blue-700 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:text-blue-300"
          >
            Show more {direction} trains
          </Link>
        </div>
      )}
    </section>
  );
}

function directionHref(
  stationId: string,
  direction: string,
  after: number | null,
  transferOrigin: TransferOrigin | null,
): string {
  const href = `/subway/station/${encodeURIComponent(stationId)}/${encodeURIComponent(direction)}`;
  const cutoff = transferOrigin
    ? encodeTransferOrigin(transferOrigin)
    : after === null
      ? null
      : String(after);
  return cutoff === null ? href : `${href}?after=${encodeURIComponent(cutoff)}`;
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
