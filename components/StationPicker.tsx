"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { SettingsButton } from "@/components/SettingsButton";
import { useFavorites } from "@/lib/favorites";
import { useRecentStations } from "@/lib/recentStations";
import { boardChoiceKey, type BoardChoice } from "@/lib/boardChoices";
import {
  boardListingsByLetter,
  getBoardListing,
  interchangeSiblings,
  nearestBoardListing,
  searchBoardListings,
  type BoardListing,
} from "@/lib/boardDirectory";
import { lineColor } from "@/lib/stations";
import { subwayRouteColor } from "@/lib/subway";


type LocationState =
  | { status: "locating" | "unavailable" }
  | { status: "found"; listing: BoardListing; distanceKm: number };

type StationReason = "nearby" | "fav" | "recent";

type StationListItem = {
  listing: BoardListing;
  reasons: StationReason[];
  nearbyDistanceKm?: number;
  recentChoices: BoardChoice[];
};

/**
 * Turns saved choices into the boards they open, dropping any this build no
 * longer recognises. Multiple provider identities can resolve to one visible
 * board (for example, the two MTA members of an Interchange), so the caller
 * aggregates them by board identity.
 */
function resolveChoices(choices: BoardChoice[]): { choice: BoardChoice; listing: BoardListing }[] {
  const resolved: { choice: BoardChoice; listing: BoardListing }[] = [];
  for (const choice of choices) {
    const listing = getBoardListing(choice);
    if (!listing) continue;
    resolved.push({ choice, listing });
  }
  return resolved;
}

const noopSubscribe = () => () => {};

const KM_PER_MILE = 1.609344;

function formatDistance(km: number): string {
  const miles = km / KM_PER_MILE;
  return miles < 0.1 ? "right here" : `${miles.toFixed(1)} mi away`;
}

export function StationPicker() {
  const { favorites, loaded: favoritesLoaded } = useFavorites();
  const { recentStations, loaded: recentStationsLoaded, clear, remove, restore } =
    useRecentStations();

  // Derived rather than set from an effect, so there is no render-then-correct
  // flicker and no synchronous state update on mount. Assumed available while
  // server-rendering, which matches every current browser.
  const geolocationAvailable = useSyncExternalStore(
    noopSubscribe,
    () => "geolocation" in navigator,
    () => true,
  );

  const [located, setLocated] = useState<LocationState | null>(null);
  const [query, setQuery] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [clearedRecentStations, setClearedRecentStations] = useState<BoardChoice[] | null>(null);

  const location = useMemo<LocationState>(
    () => located ?? (geolocationAvailable ? { status: "locating" } : { status: "unavailable" }),
    [geolocationAvailable, located],
  );

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const { listing, distanceKm } = nearestBoardListing(
          position.coords.latitude,
          position.coords.longitude,
        );
        setLocated({ status: "found", listing, distanceKm });
      },
      () => {
        // Denied or timed out — fall back to favourites and search rather
        // than nagging.
        if (!cancelled) setLocated({ status: "unavailable" });
      },
      { timeout: 8000, maximumAge: 5 * 60_000 },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clearedRecentStations) return;
    const timeout = window.setTimeout(() => setClearedRecentStations(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [clearedRecentStations]);

  const results = useMemo(() => searchBoardListings(query, 40), [query]);
  const grouped = useMemo(() => boardListingsByLetter(), []);

  const stationItems = useMemo(() => {
    const items = new Map<string, StationListItem>();

    const add = (
      listing: BoardListing,
      reason: StationReason,
      options: { choice?: BoardChoice; distanceKm?: number } = {},
    ) => {
      const key = boardChoiceKey(listing.choice);
      const item = items.get(key) ?? {
        listing,
        reasons: [],
        recentChoices: [],
      };
      if (!item.reasons.includes(reason)) item.reasons.push(reason);
      if (options.distanceKm !== undefined) item.nearbyDistanceKm = options.distanceKm;
      const recentChoice = options.choice;
      if (
        recentChoice &&
        !item.recentChoices.some((choice) => boardChoiceKey(choice) === boardChoiceKey(recentChoice))
      ) {
        item.recentChoices.push(recentChoice);
      }
      items.set(key, item);
    };

    if (location.status === "found") {
      // An Interchange is one place with a board per system, so nearby offers
      // both views rather than letting a few metres of coordinate difference
      // pick one for the rider.
      for (const listing of interchangeSiblings(location.listing)) {
        add(listing, "nearby", { distanceKm: location.distanceKm });
      }
    }

    if (favoritesLoaded) {
      for (const { listing } of resolveChoices(favorites)) add(listing, "fav");
    }

    if (recentStationsLoaded) {
      for (const { choice, listing } of resolveChoices(recentStations)) {
        add(listing, "recent", { choice });
      }
    }

    return [...items.values()];
  }, [favorites, favoritesLoaded, location, recentStations, recentStationsLoaded]);

  const clearRecentStations = () => {
    setClearedRecentStations(recentStations);
    clear();
  };

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Departures
          </h1>
          <p className="mt-1 text-sm text-muted">NJ Transit rail and NYC Subway</p>
        </div>
        <SettingsButton />
      </div>

      {(location.status === "locating" || stationItems.length > 0) && (
        <Section
          title="Stations"
          action={
            recentStationsLoaded && recentStations.length > 0 ? (
              <button
                type="button"
                onClick={clearRecentStations}
                aria-label="Clear recent stations"
                className="rounded px-2 py-1 text-xs font-medium text-muted hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              >
                Clear recent
              </button>
            ) : undefined
          }
        >
          {location.status === "locating" && (
            <p className="border-b border-edge px-4 py-3 text-sm text-muted">
              Finding the nearest station…
            </p>
          )}
          {stationItems.length > 0 && (
            <StationList
              items={stationItems}
              onRemoveRecent={(item) => remove(item.recentChoices)}
            />
          )}
        </Section>
      )}

      {clearedRecentStations && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-bg px-3 py-2 text-sm" role="status">
          <span>Recent stations cleared.</span>
          <button
            type="button"
            onClick={() => {
              restore(clearedRecentStations);
              setClearedRecentStations(null);
            }}
            aria-label="Undo clearing recent stations"
            className="font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Undo
          </button>
        </div>
      )}

      <div className="mt-7">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search stations"
          aria-label="Search stations"
          autoComplete="off"
          className="block w-full rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none placeholder:text-faint focus-visible:border-edge-strong focus-visible:ring-2 focus-visible:ring-edge-strong"
        />
      </div>

      {query ? (
        <Section title={`${results.length} result${results.length === 1 ? "" : "s"}`}>
          {results.length > 0 ? (
            <StationList items={results.map((listing) => stationListItem(listing))} />
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No stations match “{query}”.
            </p>
          )}
        </Section>
      ) : (
        <>
          <details
            className="group mt-7"
            open={directoryOpen}
            onToggle={(event) => setDirectoryOpen(event.currentTarget.open)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-edge bg-surface px-4 py-3 text-sm font-medium transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
              <span>Browse all stations</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </summary>
            {/* Rendered flat: a card wrapper would trap sticky letter headers
                in a non-scrolling container. */}
            <div className="mt-2 border-t border-edge bg-surface">
              {grouped.map(([letter, group]) => (
                <div key={letter}>
                  <h3 className="sticky top-0 z-10 border-b border-edge bg-bg px-4 py-1.5 text-xs font-semibold text-muted">
                    {letter}
                  </h3>
                  <StationList items={group.map((listing) => stationListItem(listing))} />
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </main>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {title}
        </h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-xl border border-edge bg-surface">
        {children}
      </div>
    </section>
  );
}

function subwayDetail(listing: BoardListing): string {
  if (listing.system !== "Subway") return "";
  const routes = listing.routes.join(" · ");
  return listing.alsoKnownAs.length > 0
    ? `${routes} — also ${listing.alsoKnownAs.join(", ")}`
    : routes;
}

function stationListItem(listing: BoardListing): StationListItem {
  return { listing, reasons: [], recentChoices: [] };
}

const reasonStyles: Record<StationReason, string> = {
  nearby: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  fav: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  recent: "bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
};

function StationList({
  items,
  onRemoveRecent,
}: {
  items: StationListItem[];
  onRemoveRecent?: (item: StationListItem) => void;
}) {
  return (
    <ul className="divide-y divide-edge">
      {items.map((item) => {
        const { listing } = item;
        const details = [
          item.nearbyDistanceKm === undefined
            ? ""
            : `Nearby · ${formatDistance(item.nearbyDistanceKm)}`,
          subwayDetail(listing),
        ].filter(Boolean).join(" · ");

        return (
          <li key={boardChoiceKey(listing.choice)} className="flex items-stretch">
            <Link
              href={listing.href}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{listing.name}</span>
                {/* Dozens of Subway stations share a name, so the routes have to
                    be readable rather than only coloured — the bullets beside
                    them are decoration. The complex's other published names
                    follow, for a rider who searched one of those instead. */}
                {details && (
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {details}
                  </span>
                )}
              </span>

              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                {listing.system}
              </span>

              {item.reasons.length > 0 && (
                <span className="flex shrink-0 items-center gap-1">
                  {item.reasons.map((reason) => (
                    <span
                      key={reason}
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${reasonStyles[reason]}`}
                    >
                      {reason}
                    </span>
                  ))}
                </span>
              )}

              {/* Provider-native symbols: MTA route bullets carry their letter,
                  NJT line colours are a hint alongside the names above. */}
              <span aria-hidden className="flex shrink-0 gap-1">
                {listing.system === "Subway"
                  ? listing.routes.slice(0, 4).map((route) => (
                      <span
                        key={route}
                        className="grid h-4 w-4 place-items-center rounded-full text-[0.6rem] font-bold text-white"
                        style={{ backgroundColor: subwayRouteColor(route) }}
                      >
                        {route}
                      </span>
                    ))
                  : listing.routes.map((line) => (
                      <span
                        key={line}
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: lineColor(line) }}
                      />
                    ))}
              </span>
            </Link>
            {item.recentChoices.length > 0 && onRemoveRecent && (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveRecent(item);
                }}
                aria-label={`Remove ${listing.name} from recent stations`}
                title={`Remove ${listing.name} from recent stations`}
                className="shrink-0 px-3 text-muted transition-colors hover:bg-bg hover:text-text focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
