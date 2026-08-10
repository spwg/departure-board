import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InterchangeBoard } from "@/components/InterchangeBoard";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { SubwayBoard } from "@/components/SubwayBoard";
import { SubwayStationShell } from "@/components/SubwayStationShell";
import { subwayBoardChoice } from "@/lib/boardChoices";
import { interchangeForStation } from "@/lib/interchanges";
import { getSubwayStation, getSubwayStationRoutes } from "@/lib/subway";

type SearchParams = Promise<{ after?: string | string[] }>;

function stationIdsFromParam(value: string): string[] {
  return decodeURIComponent(value).split(",").filter(Boolean);
}

function getStationContext(stationId: string) {
  const stationIds = stationIdsFromParam(stationId);
  const stations = stationIds.map(getSubwayStation);
  if (stations.length === 0 || stations.some((station) => !station)) return null;

  const station = stations[0]!;
  const routes = getSubwayStationRoutes(stationIds);
  return { station, stationIds, routes };
}

function parseAfter(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const after = Number(raw);
  return Number.isFinite(after) ? after : null;
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
  searchParams,
}: {
  params: Promise<{ stationId: string; direction: string }>;
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<p className="px-5 py-16 text-center text-muted">Loading live departures…</p>}>
      <SubwayDirectionContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SubwayDirectionContent({
  params,
  searchParams,
}: {
  params: Promise<{ stationId: string; direction: string }>;
  searchParams: SearchParams;
}) {
  const { stationId, direction: rawDirection } = await params;
  const context = getStationContext(stationId);
  if (!context) notFound();

  const direction = decodeURIComponent(rawDirection);
  const query = await searchParams;
  const after = parseAfter(query.after);
  const boardStationId = context.stationIds.join(",");
  const choice = subwayBoardChoice(context.stationIds[0]!);
  const interchange = interchangeForStation("subway", context.stationIds[0]!);

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
          href: `/subway/station/${boardStationId}`,
        },
      ]}
      breadcrumbCurrent={direction}
      breadcrumbSubtitle={null}
    >
      {interchange ? (
        <InterchangeBoard
          interchangeId={interchange.interchange.id}
          system="subway"
          direction={direction}
        />
      ) : (
        <SubwayBoard stationId={boardStationId} direction={direction} limit={null} after={after} />
      )}
      <RecentStationRecorder choice={choice} />
    </SubwayStationShell>
  );
}
