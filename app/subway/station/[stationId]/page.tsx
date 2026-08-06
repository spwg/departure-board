import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FavoriteButton } from "@/components/FavoriteButton";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { SubwayBoard } from "@/components/SubwayBoard";
import { subwayBoardChoice } from "@/lib/boardChoices";
import { getSubwayStation, getSubwayStationMembers, SUBWAY_STATIONS } from "@/lib/subway";

export function generateStaticParams() { return SUBWAY_STATIONS.map(({ id: stationId }) => ({ stationId })); }

export async function generateMetadata({ params }: { params: Promise<{ stationId: string }> }): Promise<Metadata> {
  const { stationId } = await params;
  const station = getSubwayStation(stationId);
  return { title: station ? `${station.name} departures` : "Station not found" };
}

export default async function SubwayStationPage({ params }: { params: Promise<{ stationId: string }> }) {
  const { stationId } = await params;
  const station = getSubwayStation(stationId);
  if (!station) notFound();
  const routes = [...new Set(getSubwayStationMembers(station.id).flatMap((member) => member.routes))];
  const choice = subwayBoardChoice(station.id);
  return <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
    {/* `overflow-clip` rather than `overflow-hidden`: both round off the card's
        corners, but only clip leaves the page as the scrollport, so the pinned
        header and direction headings inside actually pin. */}
    <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
      <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
        <Link href="/" aria-label="All stations" className="grid h-10 w-10 place-items-center rounded-full text-muted">←</Link>
        <div className="min-w-0 flex-1 text-center"><h1 className="truncate text-base font-semibold sm:text-lg">{station.name}</h1><p className="text-xs text-muted">{routes.join(" · ")} Subway</p></div>
        <FavoriteButton choice={choice} name={`${station.name} Subway`} />
      </header>
      <Suspense fallback={<p className="px-5 py-16 text-center text-muted">Loading live departures…</p>}>
        <SubwayBoard stationId={station.id} />
      </Suspense>
      <RecentStationRecorder choice={choice} />
    </div>
  </main>;
}
