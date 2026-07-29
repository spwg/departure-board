"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Departure, DepartureStatus } from "@/lib/departures";

const STORAGE_KEY = "departure-board:watches";
const CHANGE_EVENT = "departure-board:watches-changed";
const EMPTY: Watch[] = [];

export type WatchKey = {
  stationCode: string;
  trainNumber: string;
  scheduledTime: string;
};

/** The locally retained board details for one exact upcoming departure. */
export type Watch = WatchKey & {
  destination: string;
  expectedTime: string;
  status: DepartureStatus;
  track: string;
  line: string;
  lineCode: string;
};

let cachedRaw: string | null = null;
let cachedValue: Watch[] = EMPTY;
let memoryFallback: Watch[] | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function isDepartureStatus(value: unknown): value is DepartureStatus {
  return value === "on-time" || value === "delayed" || value === "cancelled" ||
    value === "boarding" || value === "departed";
}

function normalizeWatch(value: unknown): Watch | null {
  if (!value || typeof value !== "object") return null;
  const watch = value as Record<string, unknown>;
  if (
    typeof watch.stationCode !== "string" ||
    typeof watch.trainNumber !== "string" ||
    typeof watch.scheduledTime !== "string" ||
    typeof watch.destination !== "string" ||
    typeof watch.expectedTime !== "string" ||
    !isDepartureStatus(watch.status) ||
    typeof watch.track !== "string" ||
    typeof watch.line !== "string" ||
    typeof watch.lineCode !== "string"
  ) return null;

  return {
    stationCode: watch.stationCode.toUpperCase(),
    trainNumber: watch.trainNumber,
    scheduledTime: watch.scheduledTime,
    destination: watch.destination,
    expectedTime: watch.expectedTime,
    status: watch.status,
    track: watch.track,
    line: watch.line,
    lineCode: watch.lineCode,
  };
}

function sameWatch(a: WatchKey, b: WatchKey): boolean {
  return a.stationCode === b.stationCode &&
    a.trainNumber === b.trainNumber &&
    a.scheduledTime === b.scheduledTime;
}

function sameWatchDetails(a: Watch, b: Watch): boolean {
  return a.stationCode === b.stationCode &&
    a.trainNumber === b.trainNumber &&
    a.scheduledTime === b.scheduledTime &&
    a.destination === b.destination &&
    a.expectedTime === b.expectedTime &&
    a.status === b.status &&
    a.track === b.track &&
    a.line === b.line &&
    a.lineCode === b.lineCode;
}

function getSnapshot(): Watch[] {
  if (memoryFallback) return memoryFallback;

  const raw = readRaw();
  if (raw === cachedRaw) return cachedValue;

  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const normalized = Array.isArray(parsed)
      ? parsed.map(normalizeWatch).filter((watch): watch is Watch => watch !== null)
      : EMPTY;
    cachedValue = normalized.filter(
      (watch, index) => normalized.findIndex((other) => sameWatch(other, watch)) === index,
    );
  } catch {
    cachedValue = EMPTY;
  }
  return cachedValue;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const noopSubscribe = () => () => {};

function save(next: Watch[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    memoryFallback = null;
  } catch {
    memoryFallback = next;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function toWatch(stationCode: string, departure: Departure): Watch {
  return {
    stationCode: stationCode.toUpperCase(),
    trainNumber: departure.trainNumber,
    scheduledTime: departure.scheduledTime,
    destination: departure.destination,
    expectedTime: departure.expectedTime,
    status: departure.status,
    track: departure.track,
    line: departure.line,
    lineCode: departure.lineCode,
  };
}

/** Returns every current Watch from the single local registry. */
export function watchedDepartures(): Watch[] {
  return getSnapshot();
}

/** Adds an exact departure once, regardless of how often its row is rendered. */
export function watchDeparture(stationCode: string, departure: Departure): void {
  const nextWatch = toWatch(stationCode, departure);
  const current = getSnapshot();
  if (current.some((watch) => sameWatch(watch, nextWatch))) return;
  save([...current, nextWatch]);
}

/** Removes just one exact departure, never every daily use of its train number. */
export function unwatchDeparture(key: WatchKey): void {
  save(getSnapshot().filter((watch) => !sameWatch(watch, key)));
}

/**
 * Reconciles Watches for one board response. Only a fresh live response can
 * complete a Watch; cache, fixture, and failed responses keep it intact.
 */
export function reconcileStationWatches(
  stationCode: string,
  departures: Departure[],
  { live }: { live: boolean },
): void {
  if (!live) return;

  const normalizedStationCode = stationCode.toUpperCase();
  const current = getSnapshot();
  const next = current.flatMap((watch) => {
    if (watch.stationCode !== normalizedStationCode) return [watch];
    const departure = departures.find((candidate) => sameWatch(
      watch,
      toWatch(normalizedStationCode, candidate),
    ));
    return departure ? [toWatch(normalizedStationCode, departure)] : [];
  });

  if (next.length !== current.length || next.some((watch, index) => !sameWatchDetails(watch, current[index]!))) {
    save(next);
  }
}

/** Client hook for displaying and managing the shared Watch registry. */
export function useWatches() {
  const watches = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const loaded = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const watch = useCallback(
    (stationCode: string, departure: Departure) => watchDeparture(stationCode, departure),
    [],
  );
  const unwatch = useCallback((key: WatchKey) => unwatchDeparture(key), []);
  const isWatched = useCallback(
    (key: WatchKey) => watches.some((watch) => sameWatch(watch, key)),
    [watches],
  );

  return { watches, loaded, watch, unwatch, isWatched };
}
