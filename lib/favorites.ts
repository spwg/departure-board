"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  boardChoiceKey,
  normalizeBoardChoice,
  parseBoardChoice,
  type BoardChoice,
} from "@/lib/boardChoices";


const STORAGE_KEY = "departure-board:favorites";
/** Lets every mounted hook react to a change made anywhere in the app. */
const CHANGE_EVENT = "departure-board:favorites-changed";

const EMPTY: BoardChoice[] = [];

// useSyncExternalStore compares snapshots by identity, so parsing on every read
// would loop forever. The parsed value is reused until the raw string changes.
let cachedRaw: string | null = null;
let cachedValue: BoardChoice[] = EMPTY;

// Used when localStorage is unavailable (private mode, storage disabled), so
// starring still works for the current session even though it cannot persist.
let memoryFallback: BoardChoice[] | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode or storage disabled. Favourites are a convenience, so
    // degrade to none rather than breaking the page.
    return null;
  }
}

function getSnapshot(): BoardChoice[] {
  if (memoryFallback) return memoryFallback;

  const raw = readRaw();
  if (raw === cachedRaw) return cachedValue;

  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedValue = Array.isArray(parsed)
      ? parsed.map(parseBoardChoice).filter((choice): choice is BoardChoice => choice !== null)
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
 * Favourite provider-qualified station choices, persisted locally.
 *
 * `loaded` is false during server rendering and the hydrating pass, so the UI
 * can avoid flashing an empty state before storage has been read. `toggle`
 * adds an absent choice or removes a present one, then notifies all mounted hooks.
 */
export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const loaded = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const toggle = useCallback((choice: BoardChoice | string) => {
    const boardChoice = normalizeBoardChoice(choice);
    const current = getSnapshot();
    const key = boardChoiceKey(boardChoice);
    const next = current.some((favorite) => boardChoiceKey(favorite) === key)
      ? current.filter((favorite) => boardChoiceKey(favorite) !== key)
      : [...current, boardChoice];
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map(boardChoiceKey)));
      memoryFallback = null;
    } catch {
      memoryFallback = next;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const isFavorite = useCallback(
    (choice: BoardChoice | string) => {
      const boardChoice = normalizeBoardChoice(choice);
      return favorites.some((favorite) => boardChoiceKey(favorite) === boardChoiceKey(boardChoice));
    },
    [favorites],
  );

  return { favorites, isFavorite, toggle, loaded };
}
