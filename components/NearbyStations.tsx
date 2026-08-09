"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore, useState } from "react";
import { BoardListingList } from "@/components/BoardListingList";
import { SettingsButton } from "@/components/SettingsButton";
import { nearbyBoardListings } from "@/lib/boardDirectory";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type LocationErrorKind = "denied" | "unavailable" | "unsupported";

const noopSubscribe = () => () => {};

export function NearbyStations() {
  const geolocationAvailable = useSyncExternalStore(
    noopSubscribe,
    () => "geolocation" in navigator,
    () => true,
  );
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<LocationErrorKind | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        setLocationError(null);
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        if (cancelled) return;
        setLocationError(error.code === 1 ? "denied" : "unavailable");
      },
      { timeout: 8000, maximumAge: 5 * 60_000 },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const nearby = useMemo(
    () => coordinates ? nearbyBoardListings(coordinates.latitude, coordinates.longitude) : [],
    [coordinates],
  );
  const locating = coordinates === null && geolocationAvailable && locationError === null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Nearby</h1>
          <p className="mt-1 text-sm text-muted">Stations within 2 miles</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Favorites
          </Link>
          <SettingsButton />
        </div>
      </div>

      <section className="mt-7">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Closest first
          </h2>
        </div>
        <div className="overflow-hidden rounded-xl border border-edge bg-surface">
          {locating ? (
            <p className="px-4 py-4 text-sm text-muted">Finding nearby stations…</p>
          ) : !geolocationAvailable ? (
            <LocationError kind="unsupported" />
          ) : locationError ? (
            <LocationError kind={locationError} />
          ) : coordinates === null ? (
            <LocationError kind="unavailable" />
          ) : nearby.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">
              No stations found within 2 miles.
            </p>
          ) : (
            <BoardListingList items={nearby.map(({ listing, distanceKm }) => ({ listing, distanceKm }))} />
          )}
        </div>
      </section>
    </main>
  );
}

function LocationError({ kind }: { kind: LocationErrorKind }) {
  const copy = {
    denied: {
      title: "Location access was denied",
      message: "Allow location access in your browser settings to see stations near you.",
    },
    unavailable: {
      title: "We couldn't determine your location",
      message: "Your browser couldn't provide a location right now. Check your location settings and try again.",
    },
    unsupported: {
      title: "Location isn't available in this browser",
      message: "Use a browser with location access to see stations near you.",
    },
  }[kind];

  return (
    <div role="alert" className="px-4 py-4 text-sm text-muted">
      <p className="font-medium text-text">{copy.title}</p>
      <p className="mt-1">{copy.message}</p>
      <Link
        href="/"
        className="mt-2 inline-block font-medium text-text underline underline-offset-2"
      >
        Search stations instead
      </Link>
    </div>
  );
}
