"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  applyTheme,
  parseThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";

let override: ThemePreference | undefined;

function getSnapshot(): ThemePreference {
  // Set when storage is unavailable, so the choice still holds for this visit.
  if (override) return override;
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Locally persisted theme choice, defaulting to the OS setting. */
export function useThemePreference() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "system" as const);

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
      override = undefined;
    } catch {
      override = next;
    }
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return { theme, setTheme };
}

/** Applies a choice made in another tab, since only that tab ran setTheme. */
export function subscribeToOtherTabs(): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(getSnapshot());
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
