import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DepartureBoard } from "@/components/DepartureBoard";
import { FavoriteButton } from "@/components/FavoriteButton";
import { getStation, stations } from "@/lib/stations";

/** Tested contract: every known station is prerendered and unknown station routes resolve to not-found. */

/**
 * There are only 167 stations, so prerendering every shell is cheap and makes
 * opening a board feel instant. The departures themselves load on the client.
 */
export function generateStaticParams() {
  return stations.map((station) => ({ code: station.code }));
}

export async function generateMetadata({
  params,
}: PageProps<"/station/[code]">): Promise<Metadata> {
  const { code } = await params;
  const station = getStation(code);
  return {
    title: station ? `${station.name} departures` : "Station not found",
  };
}

export default async function StationPage({
  params,
}: PageProps<"/station/[code]">) {
  const { code } = await params;
  const station = getStation(code);
  if (!station) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      {/* Fills the screen on phones so a short board does not leave a band of
          page background below it; a self-contained card from tablet up. */}
      <div className="flex flex-1 flex-col overflow-hidden border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
          <Link
            // ?pick keeps the picker from sending you straight back here.
            href="/?pick=1"
            aria-label="All stations"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
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
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>

          <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold tracking-tight sm:text-lg">
            {station.name}
          </h1>

          <FavoriteButton code={station.code} name={station.name} />
        </header>

        <DepartureBoard code={station.code} />
      </div>
    </main>
  );
}
