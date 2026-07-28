"use client";

import { useCallback, useSyncExternalStore } from "react";


const STORAGE_KEY = "departure-board:favorites";
/** Lets every mounted hook react to a change made anywhere in the app. */
const CHANGE_EVENT = "departure-board:favorites-changed";

const EMPTY: string[] = [];

// useSyncExternalStore compares snapshots by identity, so parsing on every read
// would loop forever. The parsed value is reused until the raw string changes.
let cachedRaw: string | null = null;
let cachedValue: string[] = EMPTY;

// Used when localStorage is unavailable (private mode, storage disabled), so
// starring still works for the current session even though it cannot persist.
let memoryFallback: string[] | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode or storage disabled. Favourites are a convenience, so
    // degrade to none rather than breaking the page.
    return null;
  }
}

function getSnapshot(): string[] {
  if (memoryFallback) return memoryFallback;

  const raw = readRaw();
  if (raw === cachedRaw) return cachedValue;

  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedValue = Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : EMPTY;
  } catch {
    cachedValue = EMPTY;
  }
  return cachedValue;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  // Keeps other tabs in step.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const noopSubscribe = () => () => {};

/**
 * Favourite station codes, persisted locally.
 *
 * `loaded` is false during server rendering and the hydrating pass, so the UI
 * can avoid flashing an empty state before storage has been read. `toggle`
 * adds an absent code or removes a present one, then notifies all mounted hooks.
 */
export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const loaded = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const toggle = useCallback((code: string) => {
    const current = getSnapshot();
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code];
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      memoryFallback = null;
    } catch {
      memoryFallback = next;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const isFavorite = useCallback(
    (code: string) => favorites.includes(code),
    [favorites],
  );

  return { favorites, isFavorite, toggle, loaded };
}
