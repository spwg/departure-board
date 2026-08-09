"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BoardListingList,
  type BoardListingListItem,
} from "@/components/BoardListingList";
import { SettingsButton } from "@/components/SettingsButton";
import { useFavorites } from "@/lib/favorites";
import { boardChoiceKey, type BoardChoice } from "@/lib/boardChoices";
import {
  boardListingsByLetter,
  getBoardListing,
  searchBoardListings,
  type BoardListing,
} from "@/lib/boardDirectory";

/**
 * Turns saved choices into the boards they open, dropping any this build no
 * longer recognises and collapses multiple provider identities that resolve to
 * one visible board (for example, the two MTA members of an Interchange).
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

export function StationPicker() {
  const { favorites, loaded: favoritesLoaded } = useFavorites();
  const [query, setQuery] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);

  const results = useMemo(() => searchBoardListings(query, 40), [query]);
  const grouped = useMemo(() => boardListingsByLetter(), []);
  const favoriteItems = useMemo<BoardListingListItem[]>(
    () => resolveChoices(favorites).map((listing) => ({ listing })),
    [favorites],
  );

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
          <Link
            href="/nearby"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Nearby
          </Link>
          <SettingsButton />
        </div>
      </div>

      {favoritesLoaded && (
        <Section title="Favorites">
          {favoriteItems.length > 0 ? (
            <BoardListingList items={favoriteItems} />
          ) : (
            <p className="px-4 py-4 text-sm text-muted">
              No favorites yet. Search for a station below to get started.
            </p>
          )}
        </Section>
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
            <BoardListingList items={results.map((listing) => ({ listing }))} />
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
                  <BoardListingList items={group.map((listing) => ({ listing }))} />
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
