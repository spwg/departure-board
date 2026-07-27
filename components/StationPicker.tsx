"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useFavorites } from "@/lib/favorites";
import {
  type Station,
  getStation,
  lineColor,
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { favorites, loaded: favoritesLoaded } = useFavorites();

  // Arriving via the back arrow sets ?pick, which keeps this page put instead
  // of bouncing straight back to the nearest station.
  const browsing = searchParams.has("pick");

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
        // Opening the app should land on the board you almost certainly want.
        if (!browsing) router.replace(`/station/${station.code}`);
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
  }, [browsing, router]);

  const results = useMemo(() => searchStations(query, 40), [query]);
  const favoriteStations = useMemo(
    () =>
      favorites
        .map((code) => getStation(code))
        .filter((s): s is Station => Boolean(s)),
    [favorites],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, Station[]>();
    for (const station of stations) {
      const letter = station.name[0].toUpperCase();
      const group = groups.get(letter);
      if (group) group.push(station);
      else groups.set(letter, [station]);
    }
    return [...groups.entries()];
  }, []);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Departures
      </h1>
      <p className="mt-1 text-sm text-muted">NJ Transit rail</p>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search stations"
        aria-label="Search stations"
        autoComplete="off"
        className="mt-5 w-full rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none placeholder:text-faint focus-visible:border-edge-strong focus-visible:ring-2 focus-visible:ring-edge-strong"
      />

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
          {location.status === "locating" && (
            <Section title="Nearest">
              <p className="px-4 py-4 text-sm text-muted">
                Finding the closest station…
              </p>
            </Section>
          )}

          {location.status === "found" && (
            <Section title="Nearest">
              <StationList
                items={[location.station]}
                subtitle={formatDistance(location.distanceKm)}
              />
            </Section>
          )}

          {favoritesLoaded && favoriteStations.length > 0 && (
            <Section title="Favorites">
              <StationList items={favoriteStations} />
            </Section>
          )}

          <Section title="All stations">
            <div className="divide-y divide-edge">
              {grouped.map(([letter, group]) => (
                <div key={letter}>
                  <h3 className="bg-bg px-4 py-1.5 text-xs font-semibold text-muted">
                    {letter}
                  </h3>
                  <StationList items={group} flush />
                </div>
              ))}
            </div>
          </Section>
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
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">
        {title}
      </h2>
      <div className="overflow-hidden rounded-xl border border-edge bg-surface">
        {children}
      </div>
    </section>
  );
}

function StationList({
  items,
  subtitle,
  flush = false,
}: {
  items: Station[];
  subtitle?: string;
  flush?: boolean;
}) {
  return (
    <ul className={flush ? "" : "divide-y divide-edge"}>
      {items.map((station) => (
        <li key={station.code} className={flush ? "border-t border-edge" : ""}>
          <Link
            href={`/station/${station.code}`}
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
        </li>
      ))}
    </ul>
  );
}
