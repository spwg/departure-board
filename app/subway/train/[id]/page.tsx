import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoardMenu } from "@/components/BoardMenu";
import { SubwayStopList } from "@/components/SubwayStopList";
import { parseSubwayDepartureId } from "@/lib/subway";

/**
 * Not prerendered: MTA trip identities are minted per run, so there is no
 * fixed set to generate. The route itself loads on the client.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  // The route bullet and destination need the live feed, and the internal MTA
  // trip id is never rider-facing text, so the title stays generic.
  return { title: parseSubwayDepartureId(decodeURIComponent(id)) ? "Subway train" : "Train not found" };
}

export default async function SubwayTrainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tripId = decodeURIComponent(id);
  const parsed = parseSubwayDepartureId(tripId);
  if (!parsed) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
          <BoardMenu />
          <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold tracking-tight sm:text-lg">
            This train
          </h1>
          {/* Balances the menu button so the title stays centred. */}
          <span aria-hidden className="h-10 w-10 shrink-0" />
        </header>

        <SubwayStopList tripId={tripId} />
      </div>
    </main>
  );
}
