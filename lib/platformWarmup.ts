"use client";

import { useEffect } from "react";
import type { Coordinates } from "./currentLocation";
import { boardChoiceKey } from "./boardChoices";
import { nearbyBoardListings, type BoardListing } from "./boardDirectory";

/**
 * The closest boards are fetched ahead whatever their distance: a rider on the
 * way to a station that is not a short walk away (in a car, or crossing town)
 * still has its board when signal drops.
 */
export const WARM_NEAREST = 3;

/**
 * Favorites are fetched ahead too, with or without a location: from most of
 * Manhattan the nearest boards are all subway stops, so the rail station a
 * rider is actually heading for is usually one they have saved.
 */
export const WARM_FAVORITES = 5;

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

/**
 * The boards worth fetching ahead: the nearest few to where the rider stands,
 * then their first few favorites, each board once.
 */
export function boardsToWarm(
  coordinates: Coordinates | null,
  favorites: BoardListing[] = [],
): BoardListing[] {
  const nearest = coordinates
    ? nearbyBoardListings(coordinates.latitude, coordinates.longitude, Infinity)
      .slice(0, WARM_NEAREST)
      .map(({ listing }) => listing)
    : [];
  const seen = new Set<string>();
  return [...nearest, ...favorites.slice(0, WARM_FAVORITES)].filter((listing) => {
    const key = boardChoiceKey(listing.choice);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
 * Keeps the boards a rider is likely heading for fetched ahead while Home is
 * open: on opening, once the location is known, and again whenever the app
 * comes back to the foreground — the moment a rider pulls out their phone on
 * the way to the platform.
 */
export function useWarmBoards(coordinates: Coordinates | null, favorites: BoardListing[]) {
  useEffect(() => {
    const warm = () => {
      if (document.visibilityState === "visible") warmBoards(boardsToWarm(coordinates, favorites));
    };
    warm();
    document.addEventListener("visibilitychange", warm);
    return () => document.removeEventListener("visibilitychange", warm);
  }, [coordinates, favorites]);
}
