"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  BoardListingList,
  type BoardListingListItem,
} from "@/components/BoardListingList";
import { SettingsButton } from "@/components/SettingsButton";
import { useFavorites } from "@/lib/favorites";
import { boardChoiceKey, type BoardChoice } from "@/lib/boardChoices";
import {
  boardListingsByImportance,
  getBoardListing,
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

export function StationPicker() {
  const router = useRouter();
  const { favorites, loaded: favoritesLoaded } = useFavorites();
  const [query, setQuery] = useState("");
  // Focusing the search box means the rider is about to type, not reach for a
  // favorite, so the station list replaces Favorites until they leave search.
  const [searching, setSearching] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const hasQuery = query.trim() !== "";
  const showResults = searching || hasQuery;
  // Before anything is typed the whole directory shows, busiest boards first;
  // each keystroke then narrows it to the best few matches.
  const results = useMemo(
    () => hasQuery ? searchBoardListings(query, SUGGESTION_LIMIT) : boardListingsByImportance,
    [hasQuery, query],
  );
  const favoriteItems = useMemo<BoardListingListItem[]>(
    () => resolveChoices(favorites).map((listing) => ({ listing })),
    [favorites],
  );

  const resultLinks = () => [...(resultsRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && hasQuery && results[0]) {
      event.preventDefault();
      router.push(results[0].href);
    } else if (event.key === "Escape") {
      setQuery("");
      setSearching(false);
      event.currentTarget.blur();
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
    if (next < 0) document.getElementById("station-search")?.focus();
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
          <NearbyButton />
          <SettingsButton />
        </div>
      </div>

      <div
        className="mt-7"
        onFocus={() => setSearching(true)}
        // Moving between the box and its results stays in search; focus
        // leaving both ends it, unless a query is still showing results.
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setSearching(false);
        }}
      >
        <input
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
          className="block w-full rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none placeholder:text-faint focus-visible:border-edge-strong focus-visible:ring-2 focus-visible:ring-edge-strong"
        />
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

      {!showResults && favoritesLoaded && favoriteItems.length > 0 && (
        <Section title="Favorites">
          <BoardListingList items={favoriteItems} />
        </Section>
      )}
    </main>
  );
}

/** Opens Nearby: a location pin, since the page is about where you are. */
function NearbyButton() {
  return (
    <Link
      href="/nearby"
      aria-label="Nearby"
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
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </svg>
    </Link>
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
