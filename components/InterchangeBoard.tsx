"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { StopsResponse } from "@/app/api/stops/[train]/route";
import { formatClock } from "@/lib/departures";
import { useClockFormat } from "@/lib/clockFormat";
import { getInterchange, interchangeView, type Interchange } from "@/lib/interchanges";
import { parseTransferOrigin, type TransferOrigin } from "@/lib/transfers";
import type { SubwayTrip } from "@/lib/subway";
import { DepartureBoard } from "./DepartureBoard";
import { SubwayBoard } from "./SubwayBoard";

/** Matches the boards' own cadence, so the cutoff moves when they do. */
const REFRESH_MS = 30_000;

type Cutoff =
  | { status: "none" }
  | { status: "live"; at: number }
  | { status: "stale"; at: number }
  | { status: "unavailable" };

/**
 * One Interchange view, optionally starting after an exact train's live
 * arrival here.
 *
 * The cutoff follows that train rather than a timestamp copied when the rider
 * tapped through, so a delay moves it and already-departed trains do not
 * linger in the view. Nothing here judges whether a transfer is catchable: no
 * walking buffer, no platform coaching, every live departure after the cutoff.
 */
export function InterchangeBoard({
  interchangeId,
  system,
}: {
  interchangeId: string;
  system: string;
}) {
  const interchange = getInterchange(interchangeId)!;
  const view = interchangeView(interchange, system);
  const searchParams = useSearchParams();
  const origin = parseTransferOrigin(searchParams.get("after"));
  const cutoff = useTransferCutoff(interchange, origin);

  return (
    <>
      {cutoff.status !== "none" && (
        <TransferNotice cutoff={cutoff} origin={origin} />
      )}
      {view.system === "njt" ? (
        <DepartureBoard
          code={view.stationIds[0]!}
          after={cutoff.status === "live" || cutoff.status === "stale" ? cutoff.at : null}
        />
      ) : (
        <SubwayBoard
          stationId={view.stationIds.join(",")}
          after={cutoff.status === "live" || cutoff.status === "stale" ? cutoff.at : null}
        />
      )}
    </>
  );
}

function TransferNotice({ cutoff, origin }: { cutoff: Cutoff; origin: TransferOrigin | null }) {
  const { use24Hour } = useClockFormat();
  // An NJT train number is rider-facing; an MTA trip identity is not.
  const train = origin?.system === "njt" ? `train ${origin.trainRef}` : "your train";

  if (cutoff.status === "unavailable") {
    return (
      <p role="status" className="border-b border-edge bg-warn-soft px-5 py-2 text-center text-xs font-medium text-warn">
        No live arrival for {train} right now, so departures are not filtered by it.
      </p>
    );
  }
  if (cutoff.status === "none") return null;

  const at = formatClock(new Date(cutoff.at).toISOString(), { hour12: !use24Hour });
  return (
    <p role="status" className="border-b border-edge bg-bg px-5 py-2 text-center text-xs font-medium text-muted">
      Departures after {at}, when {train} arrives.
      {cutoff.status === "stale" && (
        <span className="text-warn"> That arrival is no longer updating.</span>
      )}
    </p>
  );
}

/**
 * Polls the originating train's own source for its live arrival at this
 * Interchange. A failure keeps the last cutoff on screen and says it has
 * stopped updating, rather than silently reverting to an unfiltered board.
 */
function useTransferCutoff(interchange: Interchange, origin: TransferOrigin | null): Cutoff {
  const [cutoff, setCutoff] = useState<Cutoff>({ status: "none" });
  const known = useRef<number | null>(null);
  const key = origin ? `${origin.system}|${origin.trainRef}` : "";

  const load = useCallback(async (signal?: AbortSignal) => {
    const parsed = parseTransferOrigin(key);
    if (!parsed) {
      setCutoff({ status: "none" });
      return;
    }
    try {
      const at = parsed.system === "njt"
        ? await njtArrival(parsed.trainRef, interchange, signal)
        : await subwayArrival(parsed.trainRef, interchange, signal);
      if (at === null) throw new Error("no live arrival");
      known.current = at;
      setCutoff({ status: "live", at });
    } catch (error) {
      if (signal?.aborted) return;
      console.error("Could not follow the originating train's arrival:", error);
      setCutoff(known.current === null
        ? { status: "unavailable" }
        : { status: "stale", at: known.current });
    }
  }, [interchange, key]);

  useEffect(() => {
    known.current = null;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => { controller.abort(); window.clearInterval(poll); };
  }, [load]);

  return cutoff;
}

async function njtArrival(
  train: string,
  interchange: Interchange,
  signal?: AbortSignal,
): Promise<number | null> {
  const response = await fetch(`/api/stops/${encodeURIComponent(train)}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  const data: StopsResponse = await response.json();
  const codes = interchange.views.find((view) => view.system === "njt")?.stationIds ?? [];
  const stop = data.stopList.stops.find((candidate) => codes.includes(candidate.code));
  return stop?.time ? Date.parse(stop.time) : null;
}

async function subwayArrival(
  tripId: string,
  interchange: Interchange,
  signal?: AbortSignal,
): Promise<number | null> {
  const response = await fetch(`/api/subway/trips/${encodeURIComponent(tripId)}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  const trip: SubwayTrip = await response.json();
  const ids = interchange.views.find((view) => view.system === "subway")?.stationIds ?? [];
  const stop = trip.stops.find((candidate) => ids.includes(candidate.id));
  return stop?.time ? Date.parse(stop.time) : null;
}
