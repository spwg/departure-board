"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  boardChoiceKey,
  normalizeBoardChoice,
  parseBoardChoice,
  type BoardChoice,
} from "@/lib/boardChoices";

const STORAGE_KEY = "departure-board:recent-stations";
const CHANGE_EVENT = "departure-board:recent-stations-changed";
const MAX_RECENT_STATIONS = 5;
const EMPTY: BoardChoice[] = [];

let cachedRaw: string | null = null;
let cachedValue: BoardChoice[] = EMPTY;
let memoryFallback: BoardChoice[] | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function normalizeRecentStationChoices(codes: unknown[]): BoardChoice[] {
  return codes
    .map(parseBoardChoice)
    .filter((choice): choice is BoardChoice => choice !== null)
    .filter((choice, index, all) =>
      all.findIndex((other) => boardChoiceKey(other) === boardChoiceKey(choice)) === index,
    )
    .slice(0, MAX_RECENT_STATIONS);
}

function getSnapshot(): BoardChoice[] {
  if (memoryFallback) return memoryFallback;

  const raw = readRaw();
  if (raw === cachedRaw) return cachedValue;

  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedValue = Array.isArray(parsed)
      ? normalizeRecentStationChoices(parsed)
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

function save(next: BoardChoice[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map(boardChoiceKey)));
    memoryFallback = null;
  } catch {
    memoryFallback = next;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Records an opened station board, keeping at most five distinct newest-first choices. */
export function recordRecentStation(choice: BoardChoice | string): void {
  const boardChoice = normalizeBoardChoice(choice);
  save([
    boardChoice,
    ...getSnapshot().filter((current) => boardChoiceKey(current) !== boardChoiceKey(boardChoice)),
  ].slice(0, MAX_RECENT_STATIONS));
}

/** Returns current persisted choices without subscribing React to storage changes. */
export function recentStationChoices(): BoardChoice[] {
  return getSnapshot();
}

/** Recent provider-qualified choices, with controls for the picker history. */
export function useRecentStations() {
  const recentStations = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const loaded = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const clear = useCallback(() => save([]), []);
  const restore = useCallback(
    (choices: BoardChoice[]) => save(normalizeRecentStationChoices(choices.map(boardChoiceKey))),
    [],
  );

  return { recentStations, loaded, clear, restore };
}
