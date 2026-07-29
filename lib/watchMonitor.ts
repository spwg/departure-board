"use client";

import { formatClock, type Departure } from "@/lib/departures";
import type { Watch } from "@/lib/watches";

export type WatchChangeKind = "cancelled" | "track" | "expected-time";

export type WatchChange = {
  watch: Watch;
  departure: Departure;
  kind: WatchChangeKind;
};

let alertSequence = 0;

export function watchAlertId(change: WatchChange): string {
  alertSequence += 1;
  return `${change.watch.stationCode}-${change.watch.trainNumber}-${change.watch.scheduledTime}-${change.kind}-${alertSequence}`;
}

type StationResponse = {
  departures: Departure[];
  live: boolean;
};

/** Returns the Watch alerts worth surfacing from one fresh station response. */
export function materialWatchChanges(
  watches: Watch[],
  stationCode: string,
  departures: Departure[],
): WatchChange[] {
  const normalizedStation = stationCode.toUpperCase();

  return watches.flatMap<WatchChange>((watch) => {
    if (watch.stationCode !== normalizedStation) return [];
    const departure = departures.find((candidate) => (
      candidate.trainNumber === watch.trainNumber &&
      candidate.scheduledTime === watch.scheduledTime
    ));
    if (!departure) return [];

    const changes: WatchChange[] = [];
    if (departure.status === "cancelled" && watch.status !== "cancelled") {
      changes.push({ watch, departure, kind: "cancelled" });
    }
    if (departure.track !== watch.track) {
      changes.push({ watch, departure, kind: "track" });
    }

    const expectedDifference = Math.abs(
      Date.parse(departure.expectedTime) - Date.parse(watch.expectedTime),
    );
    if (Number.isFinite(expectedDifference) && expectedDifference >= 2 * 60_000) {
      changes.push({ watch, departure, kind: "expected-time" });
    }
    return changes;
  });
}

/** Fetches each watched station once. Callers decide how to surface results. */
export async function pollWatchedStations(
  watches: Watch[],
  fetchStation: (stationCode: string) => Promise<StationResponse>,
): Promise<Array<{ stationCode: string; response: StationResponse }>> {
  const stationCodes = [...new Set(watches.map((watch) => watch.stationCode))];
  const results = await Promise.allSettled(stationCodes.map(async (stationCode) => ({
    stationCode,
    response: await fetchStation(stationCode),
  })));
  return results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}

/** Browser notifications are reserved for background tabs that can show them. */
export function shouldSendBrowserNotification(
  visibilityState: DocumentVisibilityState,
  permission: NotificationPermission | undefined,
): boolean {
  return visibilityState !== "visible" && permission === "granted";
}

export function watchChangeMessage(
  change: WatchChange,
  { use24Hour = false }: { use24Hour?: boolean } = {},
): string {
  const label = `Train ${change.watch.trainNumber} to ${change.departure.destination}`;
  switch (change.kind) {
    case "cancelled":
      return `${label} was cancelled.`;
    case "track":
      return change.departure.track
        ? `${label} is now on track ${change.departure.track}.`
        : `${label}'s track assignment was removed.`;
    case "expected-time":
      return `${label} now departs at ${formatClock(change.departure.expectedTime, { hour12: !use24Hour })}.`;
  }
}
