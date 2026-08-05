"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { SettingsButton } from "@/components/SettingsButton";
import { WatchedDepartures } from "@/components/WatchedDepartures";
import { useFavorites } from "@/lib/favorites";
import { useRecentStations } from "@/lib/recentStations";
import { boardChoiceKey, isNjtBoardChoice, njtBoardChoice, subwayBoardChoice, type BoardChoice } from "@/lib/boardChoices";
import { type Station, getStation, lineColor, nearestStation, searchStations, stations } from "@/lib/stations";
import { PENN_123 } from "@/lib/subway";


type LocationState =
  | { status: "locating" | "unavailable" }
  | { status: "found"; station: Station; distanceKm: number };

type HomeStationChoice = { choice: BoardChoice; station: Station; href: string; systemLabel: "NJT" | "Subway" };

function toNjtStationChoice(station: Station): HomeStationChoice {
  return { choice: njtBoardChoice(station.code), station, href: `/station/${station.code}`, systemLabel: "NJT" };
}

const pennSubwayChoice: HomeStationChoice = {
  choice: subwayBoardChoice(PENN_123.id),
  station: { code: PENN_123.id, name: PENN_123.name, lat: 40.7506, lng: -73.991, lines: [...PENN_123.routes] },
  href: `/subway/station/${PENN_123.id}`,
  systemLabel: "Subway",
};

function resolveStationChoice(choice: BoardChoice): HomeStationChoice | null {
  if (!isNjtBoardChoice(choice)) return choice.stationId === PENN_123.id ? pennSubwayChoice : null;
  const station = getStation(choice.stationId);
  return station ? { choice, station, href: `/station/${station.code}`, systemLabel: "NJT" } : null;
}

const noopSubscribe = () => () => {};

const KM_PER_MILE = 1.609344;

function formatDistance(km: number): string {
  const miles = km / KM_PER_MILE;
  return miles < 0.1 ? "right here" : `${miles.toFixed(1)} mi away`;
}

export function StationPicker() {
  const { favorites, loaded: favoritesLoaded } = useFavorites();
  const { recentStations, loaded: recentStationsLoaded, clear, restore } =
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

  const results = useMemo(
    () => [...searchStations(query, 40).map(toNjtStationChoice), ...(PENN_123.name.toLowerCase().includes(query.trim().toLowerCase()) ? [pennSubwayChoice] : [])],
    [query],
  );
  const recent = useMemo(
    () =>
      recentStations
        .map(resolveStationChoice)
        .filter((choice): choice is HomeStationChoice => Boolean(choice)),
    [recentStations],
  );
  const favoriteStations = useMemo(
    () =>
      favorites
        .map(resolveStationChoice)
        .filter((choice): choice is HomeStationChoice => Boolean(choice)),
    [favorites],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, HomeStationChoice[]>();
    for (const station of stations) {
      const letter = station.name[0].toUpperCase();
      const group = groups.get(letter);
      const choice = toNjtStationChoice(station);
      if (group) group.push(choice);
      else groups.set(letter, [choice]);
    }
    const pennGroup = groups.get("3") ?? [];
    groups.set("3", [...pennGroup, pennSubwayChoice]);
    return [...groups.entries()];
  }, []);

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
            <StationList items={recent} />
          ) : (
            <p className="px-4 py-4 text-sm text-muted">
              No recent station boards are available.
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

      {location.status === "found" && recentStationsLoaded && !recentStations.some(
        (choice) => boardChoiceKey(choice) === boardChoiceKey(njtBoardChoice(location.station.code)),
      ) && (
        <Section title="Nearest station">
          <StationList
            items={[toNjtStationChoice(location.station)]}
            subtitle={`Nearest station · ${formatDistance(location.distanceKm)}`}
          />
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
          className="min-w-0 flex-1 rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none placeholder:text-faint focus-visible:border-edge-strong focus-visible:ring-2 focus-visible:ring-edge-strong"
        />
      </div>

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
          {favoritesLoaded && favoriteStations.length > 0 && (
            <Section title="Favorites">
              <StationList items={favoriteStations} />
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
}: {
  items: HomeStationChoice[];
  subtitle?: string;
}) {
  return (
    <ul className="divide-y divide-edge">
      {items.map(({ choice, station, href, systemLabel }) => (
        <li key={boardChoiceKey(choice)}>
          <Link
            href={href}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{station.name}</span>
              {subtitle && (
                <span className="mt-0.5 block text-xs text-muted">
                  {subtitle}
                </span>
              )}
            </span>

            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
              {systemLabel}
            </span>

            {/* Line colours double as a hint of where the station can take you. */}
            <span aria-hidden className="flex shrink-0 gap-1">
              {station.lines.map((line) => (
                <span
                  key={line}
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: systemLabel === "Subway" ? "#EE352E" : lineColor(line) }}
                />
              ))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
