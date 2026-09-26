import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NjtLines } from "@/components/NjtLines";
import { ServiceStatusList } from "@/components/ServiceStatus";
import { StationHeader } from "@/components/StationHeader";
import { njtBoardChoice } from "@/lib/boardChoices";
import { getStation, stations } from "@/lib/stations";

/** One service-status shell per station, like the boards themselves. */
export function generateStaticParams() {
  return stations.map((station) => ({ code: station.code }));
}

export async function generateMetadata({
  params,
}: PageProps<"/station/[code]/status">): Promise<Metadata> {
  const { code } = await params;
  const station = getStation(code);
  return {
    title: station ? `${station.name} service status` : "Station not found",
  };
}

/**
 * A station's official service notices, kept off its departure board: trains
 * come first there, and a rider who wants the notices gets a page for them.
 */
export default async function StationServiceStatusPage({
  params,
}: PageProps<"/station/[code]/status">) {
  const { code } = await params;
  const station = getStation(code);
  if (!station) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <StationHeader
          name={station.name}
          titleHref={`/station/${station.code}`}
          routes={<NjtLines lines={station.lines} />}
          choice={njtBoardChoice(station.code)}
          favoriteName={station.name}
        />
        <h2 className="border-b border-edge px-4 py-3 text-lg font-semibold sm:px-5">Service status</h2>
        <ServiceStatusList stationCode={station.code} />
      </div>
    </main>
  );
}
