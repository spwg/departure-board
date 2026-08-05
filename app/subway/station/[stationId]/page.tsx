import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/FavoriteButton";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { SubwayBoard } from "@/components/SubwayBoard";
import { subwayBoardChoice } from "@/lib/boardChoices";
import { PENN_123 } from "@/lib/subway";

export function generateStaticParams() { return [{ stationId: PENN_123.id }]; }

export async function generateMetadata({ params }: { params: Promise<{ stationId: string }> }): Promise<Metadata> {
  const { stationId } = await params;
  return { title: stationId === PENN_123.id ? `${PENN_123.name} departures` : "Station not found" };
}

export default async function SubwayStationPage({ params }: { params: Promise<{ stationId: string }> }) {
  const { stationId } = await params;
  if (stationId !== PENN_123.id) notFound();
  const choice = subwayBoardChoice(PENN_123.id);
  return <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
    <div className="flex flex-1 flex-col overflow-hidden border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
      <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
        <Link href="/" aria-label="All stations" className="grid h-10 w-10 place-items-center rounded-full text-muted">←</Link>
        <div className="min-w-0 flex-1 text-center"><h1 className="truncate text-base font-semibold sm:text-lg">{PENN_123.name}</h1><p className="text-xs text-muted">1 · 2 · 3 Subway</p></div>
        <FavoriteButton choice={choice} name={`${PENN_123.name} Subway`} />
      </header>
      <SubwayBoard stationId={PENN_123.id} />
      <RecentStationRecorder choice={choice} />
    </div>
  </main>;
}
