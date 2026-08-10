import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { SubwayStationShell } from "@/components/SubwayStationShell";
import { TransferBoard } from "@/components/TransferBoard";
import { subwayBoardChoice } from "@/lib/boardChoices";
import { getSubwayStation, getSubwayStationRoutes, SUBWAY_STATIONS } from "@/lib/subway";

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
  const routes = getSubwayStationRoutes([station.id]);
  const choice = subwayBoardChoice(station.id);
  return <SubwayStationShell
    stationName={station.name}
    routes={routes}
    choice={choice}
    favoriteName={`${station.name} Subway`}
  >
    <Suspense fallback={<p className="px-5 py-16 text-center text-muted">Loading live departures…</p>}>
      <TransferBoard choice={choice} />
    </Suspense>
    <RecentStationRecorder choice={choice} />
  </SubwayStationShell>;
}
