"use client";

import { useEffect } from "react";
import type { Coordinates } from "./currentLocation";
import { nearbyBoardListings, type BoardListing } from "./boardDirectory";

/**
 * Boards within a short walk are fetched ahead of time, so a rider whose
 * signal dies on the platform still opens a recent board instead of an
 * offline page. About a twelve-minute walk: farther than that, the board
 * fetched now is old news by the time the rider gets there.
 */
export const WARM_MAX_DISTANCE_KM = 1;

/** At most this many boards are fetched ahead, closest first. */
export const WARM_LIMIT = 3;

/** A board fetched more recently than this is not fetched again. */
const WARM_INTERVAL_MS = 2 * 60_000;

/**
 * The page and data URLs a board's own route requests, exactly as it requests
 * them, so the service worker's cached copies are the ones that board finds.
 */
export function boardWarmUrls(listing: BoardListing): string[] {
  const { system, stationId } = listing.choice;
  return system === "njt"
    ? [listing.href, `/api/departures/${encodeURIComponent(stationId)}`]
    : [listing.href, `/api/subway/departures/${encodeURIComponent(stationId)}?exact=true`];
}

/** The boards worth fetching ahead from where the rider stands. */
export function boardsToWarm(coordinates: Coordinates): BoardListing[] {
  return nearbyBoardListings(coordinates.latitude, coordinates.longitude, WARM_MAX_DISTANCE_KM)
    .slice(0, WARM_LIMIT)
    .map(({ listing }) => listing);
}

const lastWarmedAt = new Map<string, number>();

/** Asks the service worker to fetch and keep these boards; no-op without one. */
export function warmBoards(listings: BoardListing[], now = Date.now()): string[] {
  const controller = typeof navigator !== "undefined"
    ? navigator.serviceWorker?.controller
    : undefined;
  if (!controller) return [];

  const urls = listings
    .flatMap(boardWarmUrls)
    .filter((url) => now - (lastWarmedAt.get(url) ?? -Infinity) >= WARM_INTERVAL_MS);
  if (urls.length === 0) return [];

  for (const url of urls) lastWarmedAt.set(url, now);
  controller.postMessage({ type: "warm-boards", urls });
  return urls;
}

/** Test hook: forgets which boards were fetched ahead. */
export function resetWarmedBoards() {
  lastWarmedAt.clear();
}

/**
 * Keeps the boards near the rider fetched ahead while Home is open: once the
 * location is known, and again whenever the app comes back to the foreground
 * — the moment a rider pulls out their phone on the way to the platform.
 */
export function useWarmNearbyBoards(coordinates: Coordinates | null) {
  useEffect(() => {
    if (!coordinates) return;
    const warm = () => {
      if (document.visibilityState === "visible") warmBoards(boardsToWarm(coordinates));
    };
    warm();
    document.addEventListener("visibilitychange", warm);
    return () => document.removeEventListener("visibilitychange", warm);
  }, [coordinates]);
}
