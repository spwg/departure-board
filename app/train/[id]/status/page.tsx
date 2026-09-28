import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PageTitle } from "@/components/PageTitle";
import { HomeButton } from "@/components/StationHeader";
import { ServiceStatusList } from "@/components/ServiceStatus";
import { SettingsButton } from "@/components/SettingsButton";
import { isNjtTrainId } from "@/lib/departures";
import { LINE_NAMES, lineName } from "@/lib/stations";
import { decodeRouteParam } from "@/lib/routeParams";

export async function generateMetadata({
  params,
}: PageProps<"/train/[id]/status">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Train ${decodeRouteParam(id)} service status` };
}

/**
 * The official notices for a train's line, kept off its remaining route the
 * way a station's are kept off its board. The train page links here once it
 * knows the line.
 */
export default async function TrainServiceStatusPage({
  params,
  searchParams,
}: PageProps<"/train/[id]/status">) {
  const { id } = await params;
  const train = decodeRouteParam(id).trim();
  const { line } = await searchParams;
  const lineCode = typeof line === "string" ? line.toUpperCase() : "";
  if (!isNjtTrainId(train) || !(lineCode in LINE_NAMES)) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-hidden border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <PageHeader>
          <HomeButton />
          <PageTitle title="Service status" subtitle={`Train ${train} · ${lineName(lineCode)}`} />
          <SettingsButton />
        </PageHeader>

        <ServiceStatusList lineCode={lineCode} />
      </div>
    </main>
  );
}
