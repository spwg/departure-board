import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { StationHeader } from "@/components/StationHeader";
import { StationTransferLinks } from "@/components/StationTransferLinks";
import { TransferBoard } from "@/components/TransferBoard";
import { njtBoardChoice } from "@/lib/boardChoices";
import { getStation, lineColor, lineName, stations } from "@/lib/stations";

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
        <StationHeader
          name={station.name}
          routes={<NjtLines lines={station.lines} />}
          choice={njtBoardChoice(station.code)}
          favoriteName={station.name}
        />

        <StationTransferLinks system="njt" stationId={station.code} />
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

/** NJT's line colours with their names, as the rail map labels them. */
function NjtLines({ lines }: { lines: string[] }) {
  return (
    // Inline items so a long list ends in an ellipsis rather than a cut word.
    <ul className="min-w-0 truncate text-xs leading-5 text-muted">
      {lines.map((line) => (
        <li key={line} className="mr-2 inline">
          <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: lineColor(line) }} />
          {lineName(line)}
        </li>
      ))}
    </ul>
  );
}
