"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/departures";
import { useClockFormat } from "@/lib/clockFormat";
import { subwayRouteColor, type SubwayBoard as Board } from "@/lib/subway";
import { FreshnessWarning } from "./FreshnessWarning";

const REFRESH_MS = 30_000;

export function SubwayBoard({ stationId }: { stationId: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(0);
  const loaded = useRef(false);

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

  const groups = ["Uptown", "Downtown"].map((direction) => ({
    direction,
    departures: board.departures.filter((departure) => departure.direction === direction),
  })).filter((group) => group.departures.length > 0);

  return <>
    {stale && <FreshnessWarning lastLiveAt={Date.parse(board.sourceTimestamp)} />}
    {groups.length === 0 ? <p className="px-5 py-16 text-center text-muted">No live departures available.</p> : groups.map((group) => (
      <section key={group.direction} aria-labelledby={`subway-${group.direction}`}>
        <h2 id={`subway-${group.direction}`} className="border-y border-edge bg-bg px-5 py-2 text-sm font-semibold">{group.direction}</h2>
        <ul className="divide-y divide-edge">{group.departures.map((departure) => (
          <SubwayRow key={departure.id} departure={departure} now={now} />
        ))}</ul>
      </section>
    ))}
  </>;
}

function SubwayRow({ departure, now }: { departure: Board["departures"][number]; now: number }) {
  const { use24Hour } = useClockFormat();
  const minutes = Math.max(0, Math.round((Date.parse(departure.expectedTime) - now) / 60_000));
  return <li className="flex items-center gap-4 px-5 py-4">
    <span aria-label={`${departure.route} train`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-bold text-white" style={{ backgroundColor: subwayRouteColor(departure.route) }}>{departure.route}</span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-lg font-semibold">{departure.destination}</span>
      <span className="block text-sm text-muted">{departure.direction}</span>
    </span>
    <span className="shrink-0 text-right">
      <span className="block text-lg font-semibold">{minutes === 0 ? "now" : `${minutes} min`}</span>
      <span className="block text-sm text-muted">{formatClock(departure.expectedTime, { hour12: !use24Hour })}</span>
    </span>
  </li>;
}
