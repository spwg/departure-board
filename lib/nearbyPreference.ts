"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "departure-board:show-nearby";
const CHANGE_EVENT = "departure-board:show-nearby-changed";

// Set when storage is unavailable, so the choice still holds for this visit.
let override: boolean | undefined;

function getSnapshot(): boolean {
  if (override !== undefined) return override;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Whether Home shows its Nearby section; on unless hidden in Settings. */
export function useShowNearby() {
  const showNearby = useSyncExternalStore(subscribe, getSnapshot, () => true);

  const setShowNearby = useCallback((next: boolean) => {
    try {
      if (next) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, "false");
      override = undefined;
    } catch {
      override = next;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { showNearby, setShowNearby };
}
