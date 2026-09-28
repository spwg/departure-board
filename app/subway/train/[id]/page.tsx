import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { HomeButton } from "@/components/StationHeader";
import { SettingsButton } from "@/components/SettingsButton";
import { SubwayStopList } from "@/components/SubwayStopList";
import {
  SubwayServiceStatusButton,
  SubwayTrainProvider,
  SubwayTrainTitle,
} from "@/components/SubwayTrainHeader";
import { parseSubwayDepartureId } from "@/lib/subway";
import { decodeRouteParam } from "@/lib/routeParams";

/**
 * Not prerendered: MTA trip identities are minted per run, so there is no
 * fixed set to generate. The route itself loads on the client.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  // The route bullet and destination need the live feed, and the internal MTA
  // trip id is never rider-facing text, so the title stays generic.
  return { title: parseSubwayDepartureId(decodeRouteParam(id)) ? "Subway train" : "Train not found" };
}

export default async function SubwayTrainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tripId = decodeRouteParam(id);
  const parsed = parseSubwayDepartureId(tripId);
  if (!parsed) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <SubwayTrainProvider>
          <PageHeader>
            <HomeButton />
            <SubwayTrainTitle />
            <SubwayServiceStatusButton tripId={tripId} />
            <SettingsButton />
          </PageHeader>

          <SubwayStopList tripId={tripId} />
        </SubwayTrainProvider>
      </div>
    </main>
  );
}
