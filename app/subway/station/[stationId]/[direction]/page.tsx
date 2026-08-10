import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { StationTransferLinks } from "@/components/StationTransferLinks";
import { SubwayStationShell } from "@/components/SubwayStationShell";
import { TransferBoard } from "@/components/TransferBoard";
import { subwayBoardChoice } from "@/lib/boardChoices";
import { getSubwayStation } from "@/lib/subway";
import { transferHref } from "@/lib/transfers";

function stationIdsFromParam(value: string): string[] {
  return decodeURIComponent(value).split(",").filter(Boolean);
}

function getStationContext(stationId: string) {
  const stationIds = stationIdsFromParam(stationId);
  const stations = stationIds.map(getSubwayStation);
  if (stations.length === 0 || stations.some((station) => !station)) return null;

  const station = stations[0]!;
  const routes = [...new Set(stations.flatMap((current) => current!.routes))];
  return { station, stationIds, routes };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stationId: string; direction: string }>;
}): Promise<Metadata> {
  const { stationId, direction } = await params;
  const context = getStationContext(stationId);
  if (!context) return { title: "Station not found" };
  return { title: `${context.station.name} ${decodeURIComponent(direction)} departures` };
}

export default function SubwayDirectionPage({
  params,
}: {
  params: Promise<{ stationId: string; direction: string }>;
}) {
  return (
    <Suspense fallback={<p className="px-5 py-16 text-center text-muted">Loading live departures…</p>}>
      <SubwayDirectionContent params={params} />
    </Suspense>
  );
}

async function SubwayDirectionContent({
  params,
}: {
  params: Promise<{ stationId: string; direction: string }>;
}) {
  const { stationId, direction: rawDirection } = await params;
  const context = getStationContext(stationId);
  if (!context) notFound();

  const direction = decodeURIComponent(rawDirection);
  const boardStationId = context.stationIds.join(",");
  const choice = subwayBoardChoice(context.stationIds[0]!);

  return (
    <SubwayStationShell
      stationName={context.station.name}
      routes={context.routes}
      choice={choice}
      favoriteName={`${context.station.name} Subway`}
      breadcrumbParents={[
        { label: "Stations", href: "/" },
        {
          label: `${context.station.name} Subway`,
          href: transferHref(choice),
        },
      ]}
      breadcrumbCurrent={direction}
      breadcrumbSubtitle={null}
    >
      <StationTransferLinks system="subway" stationId={context.stationIds[0]!} />
      <TransferBoard choice={{ ...choice, stationId: boardStationId }} direction={direction} />
      <RecentStationRecorder choice={choice} />
    </SubwayStationShell>
  );
}
