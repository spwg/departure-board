"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  BoardListingList,
  type BoardListingListItem,
} from "@/components/BoardListingList";
import { SettingsButton } from "@/components/SettingsButton";
import { useCurrentLocation, type LocationState } from "@/lib/currentLocation";
import { useFavorites } from "@/lib/favorites";
import { useShowNearby } from "@/lib/nearbyPreference";
import { distanceKm } from "@/lib/stations";
import { boardChoiceKey, type BoardChoice } from "@/lib/boardChoices";
import {
  boardListingsByImportance,
  getBoardListing,
  nearbyBoardListings,
  searchBoardListings,
  type BoardListing,
} from "@/lib/boardDirectory";

/**
 * Turns saved choices into the boards they open, dropping any this build no
 * longer recognises, while keeping each provider-owned station board as its
 * own destination.
 */
function resolveChoices(choices: BoardChoice[]): BoardListing[] {
  const seen = new Set<string>();
  const resolved: BoardListing[] = [];
  for (const choice of choices) {
    const listing = getBoardListing(choice);
    if (!listing) continue;
    const key = boardChoiceKey(listing.choice);
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(listing);
  }
  return resolved;
}

/** How many autocomplete suggestions show at once. */
const SUGGESTION_LIMIT = 8;

/** How many nearby boards Home lists before "Show more". */
const NEARBY_PREVIEW = 5;

export function StationPicker() {
  const router = useRouter();
  const { favorites, loaded: favoritesLoaded } = useFavorites();
  const { showNearby } = useShowNearby();
  const location = useCurrentLocation(showNearby);
  const [query, setQuery] = useState("");
  // Search stays behind the header's magnifier: riders mostly want a
  // favorite or a nearby board, which Home lists without any typing.
  const [searchOpen, setSearchOpen] = useState(false);
  // Focusing the search box means the rider is about to type, not reach for a
  // listed board, so the station list replaces Home's lists until they leave.
  const [searching, setSearching] = useState(false);
  const [nearbyExpanded, setNearbyExpanded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const hasQuery = query.trim() !== "";
  const showResults = searching || hasQuery;
  // Before anything is typed the whole directory shows, busiest boards first;
  // each keystroke then narrows it to the best few matches.
  const results = useMemo(
    () => hasQuery ? searchBoardListings(query, SUGGESTION_LIMIT) : boardListingsByImportance,
    [hasQuery, query],
  );

  const coordinates = location.state.status === "found" ? location.state.coordinates : null;
  const nearby = useMemo(
    () => coordinates ? nearbyBoardListings(coordinates.latitude, coordinates.longitude) : [],
    [coordinates],
  );
  // A favorite that is also nearby stays under Favorites. Every favorite shows
  // its distance once location is known, however far outside Nearby it is.
  const favoriteListings = useMemo(() => resolveChoices(favorites), [favorites]);
  const favoriteKeys = useMemo(
    () => new Set(favoriteListings.map((listing) => boardChoiceKey(listing.choice))),
    [favoriteListings],
  );
  const favoriteItems = useMemo<BoardListingListItem[]>(
    () => favoriteListings.map((listing) => ({
      listing,
      distanceKm: coordinates
        ? distanceKm(coordinates.latitude, coordinates.longitude, listing.latitude, listing.longitude)
        : undefined,
    })),
    [favoriteListings, coordinates],
  );
  const nearbyItems = useMemo<BoardListingListItem[]>(
    () => nearby.filter((item) => !favoriteKeys.has(boardChoiceKey(item.listing.choice))),
    [nearby, favoriteKeys],
  );

  function openSearch() {
    // Rendered and focused within the tap itself: iOS only raises the
    // keyboard for a focus that happens inside the rider's gesture.
    flushSync(() => setSearchOpen(true));
    searchRef.current?.focus();
  }

  function closeSearch() {
    setQuery("");
    setSearching(false);
    setSearchOpen(false);
  }

  const resultLinks = () => [...(resultsRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && hasQuery && results[0]) {
      event.preventDefault();
      router.push(results[0].href);
    } else if (event.key === "Escape") {
      closeSearch();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      resultLinks()[0]?.focus();
    }
  }

  // Arrow keys walk the suggestions and climb back into the search box.
  function onResultsKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const links = resultLinks();
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) searchRef.current?.focus();
    else links[Math.min(next, links.length - 1)]?.focus();
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Departures
          </h1>
          <p className="mt-1 text-sm text-muted">NJ Transit rail and NYC Subway</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SearchButton onClick={openSearch} />
          <SettingsButton />
        </div>
      </div>

      {searchOpen && (
        <div
          className="mt-7"
          onFocus={() => setSearching(true)}
          // Moving between the box and its results stays in search; focus
          // leaving both ends it, and an empty box folds back behind the
          // magnifier.
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            setSearching(false);
            if (!hasQuery) setSearchOpen(false);
          }}
        >
          <div className="flex items-center gap-2">
            <input
              ref={searchRef}
              id="station-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search stations"
              aria-label="Search stations"
              aria-controls="station-search-results"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="block w-full min-w-0 flex-1 rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none placeholder:text-faint focus-visible:border-edge-strong focus-visible:ring-2 focus-visible:ring-edge-strong"
            />
            <button
              type="button"
              onClick={closeSearch}
              className="shrink-0 rounded-lg px-2 py-2 text-sm font-medium text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              Cancel
            </button>
          </div>
          {showResults && (
            <section
              id="station-search-results"
              aria-label="Search results"
              aria-live={hasQuery ? "polite" : "off"}
              // A tap on a result must not blur the box first: some browsers
              // give links no focus, so the list would close before the click.
              onMouseDown={(event) => event.preventDefault()}
              className="mt-2 overflow-hidden rounded-xl border border-edge bg-surface"
            >
              {results.length > 0 ? (
                <div ref={resultsRef} onKeyDown={onResultsKeyDown}>
                  <BoardListingList items={results.map((listing) => ({ listing }))} />
                </div>
              ) : (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  No stations match “{query}”.
                </p>
              )}
            </section>
          )}
        </div>
      )}

      {!showResults && favoritesLoaded && favoriteItems.length > 0 && (
        <Section title="Favorites">
          <BoardListingList items={favoriteItems} />
        </Section>
      )}

      {!showResults && showNearby && (
        <Section title="Nearby">
          <NearbyContent
            state={location.state}
            items={nearbyExpanded ? nearbyItems : nearbyItems.slice(0, NEARBY_PREVIEW)}
            hiddenCount={nearbyExpanded ? 0 : Math.max(nearbyItems.length - NEARBY_PREVIEW, 0)}
            onLocate={location.locate}
            onShowMore={() => setNearbyExpanded(true)}
          />
        </Section>
      )}
    </main>
  );
}

/**
 * The Nearby section's body. Until the browser allows location it is grayed
 * out with one button, whether the rider has never been asked or said no.
 */
function NearbyContent({
  state,
  items,
  hiddenCount,
  onLocate,
  onShowMore,
}: {
  state: LocationState;
  items: BoardListingListItem[];
  hiddenCount: number;
  onLocate: () => void;
  onShowMore: () => void;
}) {
  switch (state.status) {
    case "checking":
      // Blank for the moment it takes the browser to answer, so a phone that
      // already allows location never flashes the grayed-out state first.
      return <div aria-busy className="h-[3.25rem]" />;
    case "locating":
      return <p className="px-4 py-4 text-sm text-muted">Finding nearby stations…</p>;
    case "off":
    case "unavailable":
      return (
        <div className="flex items-center gap-3 bg-bg/60 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-faint">
            {state.status === "off"
              ? "Turn on location to see stations near you."
              : "Couldn’t find your location."}
          </p>
          <button
            type="button"
            onClick={onLocate}
            className="shrink-0 rounded-lg border border-edge bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            {state.status === "off" ? "Enable location" : "Try again"}
          </button>
        </div>
      );
    case "found":
      if (items.length === 0) {
        return <p className="px-4 py-4 text-sm text-muted">No other stations within 2 miles.</p>;
      }
      return (
        <>
          <BoardListingList items={items} />
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={onShowMore}
              className="block w-full border-t border-edge px-4 py-3 text-left text-sm font-medium text-muted transition-colors hover:bg-bg hover:text-text focus-visible:bg-bg focus-visible:outline-none"
            >
              Show {hiddenCount} more
            </button>
          )}
        </>
      );
  }
}

/** Opens search: riders rarely need it, so it waits behind this button. */
function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {title}
        </h2>
      </div>
      <div className="overflow-hidden rounded-xl border border-edge bg-surface">
        {children}
      </div>
    </section>
  );
}
