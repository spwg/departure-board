"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "departure-board:use-24-hour-time";
const CHANGE_EVENT = "departure-board:clock-format-changed";

let cachedRaw: string | null | undefined;
let cachedValue = false;

function devicePrefers24HourTime(): boolean {
  const hourCycle = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
  }).resolvedOptions().hourCycle;
  return hourCycle === "h23" || hourCycle === "h24";
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): boolean {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedValue;

  cachedRaw = raw;
  cachedValue = raw === null ? devicePrefers24HourTime() : raw === "true";
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

/** Locally persisted clock choice, falling back to the browser convention. */
export function useClockFormat() {
  const use24Hour = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const loaded = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const toggle = useCallback(() => {
    const next = !getSnapshot();
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      cachedRaw = String(next);
    }
    cachedRaw = String(next);
    cachedValue = next;
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { use24Hour, toggle, loaded };
}
