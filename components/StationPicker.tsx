"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { SettingsButton } from "@/components/SettingsButton";
import { WatchedDepartures } from "@/components/WatchedDepartures";
import { useFavorites } from "@/lib/favorites";
import { useRecentStations } from "@/lib/recentStations";
import {
  LINE_NAMES,
  type Station,
  getStation,
  lineColor,
  lineName,
  nearestStation,
  searchStations,
  stations,
} from "@/lib/stations";


type LocationState =
  | { status: "locating" | "unavailable" }
  | { status: "found"; station: Station; distanceKm: number };

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
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [clearedRecentStations, setClearedRecentStations] = useState<string[] | null>(null);

  const location: LocationState =
    located ??
    (geolocationAvailable ? { status: "locating" } : { status: "unavailable" });

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const { station, distanceKm } = nearestStation(
          position.coords.latitude,
          position.coords.longitude,
        );
        setLocated({ status: "found", station, distanceKm });
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

  const matchesSelectedLines = useCallback(
    (station: Station) =>
      selectedLines.length === 0 ||
      station.lines.some((line) => selectedLines.includes(line)),
    [selectedLines],
  );

  const results = useMemo(
    () => searchStations(query, 40).filter(matchesSelectedLines),
    [query, matchesSelectedLines],
  );
  const recent = useMemo(
    () =>
      recentStations
        .map((code) => getStation(code))
        .filter((station): station is Station => Boolean(station))
        .filter(matchesSelectedLines),
    [recentStations, matchesSelectedLines],
  );
  const favoriteStations = useMemo(
    () =>
      favorites
        .map((code) => getStation(code))
        .filter((s): s is Station => Boolean(s)),
    [favorites],
  );
  const filteredFavoriteStations = useMemo(
    () => favoriteStations.filter(matchesSelectedLines),
    [favoriteStations, matchesSelectedLines],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, Station[]>();
    for (const station of stations.filter(matchesSelectedLines)) {
      const letter = station.name[0].toUpperCase();
      const group = groups.get(letter);
      if (group) group.push(station);
      else groups.set(letter, [station]);
    }
    return [...groups.entries()];
  }, [matchesSelectedLines]);

  const toggleLine = (line: string) => {
    setSelectedLines((current) =>
      current.includes(line)
        ? current.filter((selected) => selected !== line)
        : [...current, line],
    );
  };

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
          <p className="mt-1 text-sm text-muted">NJ Transit rail</p>
        </div>
        <SettingsButton />
      </div>

      <WatchedDepartures />

      {recentStationsLoaded && recentStations.length > 0 && (
        <Section
          title="Recent stations"
          action={
            <button
              type="button"
              onClick={clearRecentStations}
              aria-label="Clear recent stations"
              className="rounded px-2 py-1 text-xs font-medium text-muted hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              Clear
            </button>
          }
        >
          {recent.length > 0 ? (
            <StationList items={recent} onRemove={(station) => remove(station.code)} />
          ) : (
            <p className="px-4 py-4 text-sm text-muted">
              No recent stations match the selected lines.
            </p>
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

      {location.status === "locating" && (
        <Section title="Nearest station">
          <p className="px-4 py-4 text-sm text-muted">
            Finding the nearest station…
          </p>
        </Section>
      )}

      {location.status === "found" && recentStationsLoaded && !recentStations.includes(location.station.code) && (
        <Section title="Nearest station">
          <StationList
            items={[location.station]}
            subtitle={`Nearest station · ${formatDistance(location.distanceKm)}`}
          />
        </Section>
      )}

      <div className="mt-7 flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search stations"
          aria-label="Search stations"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none placeholder:text-faint focus-visible:border-edge-strong focus-visible:ring-2 focus-visible:ring-edge-strong"
        />
        <button
          type="button"
          aria-label="Filter stations"
          aria-expanded={filtersOpen}
          aria-controls="line-filter-options"
          onClick={() => setFiltersOpen((open) => !open)}
          className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-edge bg-surface text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {selectedLines.length > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-text px-1 text-[10px] font-bold text-surface">
              {selectedLines.length}
            </span>
          )}
        </button>
      </div>

      {filtersOpen && (
        <fieldset id="line-filter-options" className="mt-2 rounded-xl border border-edge bg-surface px-4 py-3">
          <legend className="sr-only">Line filter</legend>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Filter by rail line</p>
            {selectedLines.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedLines([])}
                className="text-xs font-medium text-muted underline underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              >
                Clear filters
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">Show stations served by any selected rail line.</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {Object.keys(LINE_NAMES).map((line) => (
              <label key={line} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={selectedLines.includes(line)}
                  onChange={() => {
                    setDirectoryOpen(true);
                    toggleLine(line);
                  }}
                />
                {lineName(line)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {query ? (
        <Section title={`${results.length} result${results.length === 1 ? "" : "s"}`}>
          {results.length > 0 ? (
            <StationList items={results} />
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No stations match “{query}”.
            </p>
          )}
        </Section>
      ) : (
        <>
          {favoritesLoaded && filteredFavoriteStations.length > 0 && (
            <Section title="Favorites">
              <StationList items={filteredFavoriteStations} />
            </Section>
          )}

          <details
            className="group mt-7"
            open={directoryOpen}
            onToggle={(event) => setDirectoryOpen(event.currentTarget.open)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-edge bg-surface px-4 py-3 text-sm font-medium transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
              <span>Browse all stations</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {selectedLines.length > 0 && `${grouped.reduce((count, [, stations]) => count + stations.length, 0)} matching`}
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
                  <StationList items={group} />
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

function StationList({
  items,
  subtitle,
  onRemove,
}: {
  items: Station[];
  subtitle?: string;
  onRemove?: (station: Station) => void;
}) {
  return (
    <ul className="divide-y divide-edge">
      {items.map((station) => (
        <li key={station.code} className={onRemove ? "flex items-center" : ""}>
          <Link
            href={`/station/${station.code}`}
            className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none ${
              onRemove ? "min-w-0 flex-1" : ""
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{station.name}</span>
              {subtitle && (
                <span className="mt-0.5 block text-xs text-muted">
                  {subtitle}
                </span>
              )}
            </span>

            {/* Line colours double as a hint of where the station can take you. */}
            <span aria-hidden className="flex shrink-0 gap-1">
              {station.lines.map((line) => (
                <span
                  key={line}
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: lineColor(line) }}
                />
              ))}
            </span>
          </Link>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(station)}
              aria-label={`Remove ${station.name} from recent stations`}
              className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
