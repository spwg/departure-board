import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FavoriteButton } from "@/components/FavoriteButton";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { SettingsButton } from "@/components/SettingsButton";
import { TransferBoard } from "@/components/TransferBoard";
import { njtBoardChoice } from "@/lib/boardChoices";
import { getStation, stations } from "@/lib/stations";

/**
 * There are only 167 stations, so prerendering every shell is cheap and makes
 * opening a board feel instant. The departures themselves load on the client.
 *
 * Preconditions: `stations` is the canonical directory and its codes are
 * route-safe. Postcondition: every directory code is returned exactly once.
 */
export function generateStaticParams() {
  return stations.map((station) => ({ code: station.code }));
}

/** Returns a station-specific title, or a safe not-found title for an unknown code. */
export async function generateMetadata({
  params,
}: PageProps<"/station/[code]">): Promise<Metadata> {
  const { code } = await params;
  const station = getStation(code);
  return {
    title: station ? `${station.name} departures` : "Station not found",
  };
}

/** Renders a board only for a directory station; all other codes invoke Next's not-found boundary. */
export default async function StationPage({
  params,
}: PageProps<"/station/[code]">) {
  const { code } = await params;
  const station = getStation(code);
  if (!station) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      {/* Fills the screen on phones so a short board does not leave a band of
          page background below it; a self-contained card from tablet up.
          `overflow-clip` rather than `overflow-hidden`: both round off the
          corners, but only clip leaves the page as the scrollport, so the
          pinned header inside actually pins. */}
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
          <Breadcrumbs
            parents={[{ label: "Stations", href: "/" }]}
            current={station.name}
          />
          <SettingsButton />
          <FavoriteButton
            choice={njtBoardChoice(station.code)}
            name={station.name}
          />
        </header>

        <Suspense fallback={<p className="px-5 py-16 text-center text-muted">Loading live departures…</p>}>
          <TransferBoard choice={njtBoardChoice(station.code)} />
        </Suspense>
        <RecentStationRecorder
            choice={njtBoardChoice(station.code)}
        />
      </div>
    </main>
  );
}
