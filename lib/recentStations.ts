"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "departure-board:recent-stations";
const CHANGE_EVENT = "departure-board:recent-stations-changed";
const MAX_RECENT_STATIONS = 5;
const EMPTY: string[] = [];

let cachedRaw: string | null = null;
let cachedValue: string[] = EMPTY;
let memoryFallback: string[] | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function normalizeRecentStationCodes(codes: unknown[]): string[] {
  return codes
    .filter((value): value is string => typeof value === "string")
    .map((code) => code.toUpperCase())
    .filter((code, index, all) => all.indexOf(code) === index)
    .slice(0, MAX_RECENT_STATIONS);
}

function getSnapshot(): string[] {
  if (memoryFallback) return memoryFallback;

  const raw = readRaw();
  if (raw === cachedRaw) return cachedValue;

  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedValue = Array.isArray(parsed)
      ? normalizeRecentStationCodes(parsed)
      : EMPTY;
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

function save(next: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    memoryFallback = null;
  } catch {
    memoryFallback = next;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Records an opened station, keeping at most five distinct newest-first codes. */
export function recordRecentStation(code: string): void {
  const normalized = code.toUpperCase();
  save([normalized, ...getSnapshot().filter((current) => current !== normalized)].slice(0, MAX_RECENT_STATIONS));
}

/** Recent station codes persisted locally, with controls for the picker history. */
export function useRecentStations() {
  const recentStations = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const loaded = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const clear = useCallback(() => save([]), []);
  const restore = useCallback((codes: string[]) => save(normalizeRecentStationCodes(codes)), []);

  return { recentStations, loaded, clear, restore };
}
