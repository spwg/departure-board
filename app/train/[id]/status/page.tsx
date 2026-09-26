import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ServiceStatusList } from "@/components/ServiceStatus";
import { SettingsButton } from "@/components/SettingsButton";
import { isExcludedTrainId } from "@/lib/departures";
import { getStation, LINE_NAMES, lineName } from "@/lib/stations";

export async function generateMetadata({
  params,
}: PageProps<"/train/[id]/status">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Train ${decodeURIComponent(id)} service status` };
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
  const train = decodeURIComponent(id).trim();
  const { line, from } = await searchParams;
  const lineCode = typeof line === "string" ? line.toUpperCase() : "";
  if (!train || isExcludedTrainId(train) || !(lineCode in LINE_NAMES)) notFound();

  const origin = typeof from === "string" ? getStation(from) : undefined;
  const trainHref = `/train/${encodeURIComponent(train)}${origin ? `?from=${origin.code}` : ""}`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-hidden border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
          <Breadcrumbs
            parents={[
              { label: "Home", href: "/" },
              ...(origin ? [{ label: origin.name, href: `/station/${origin.code}` }] : []),
              { label: `Train ${train}`, href: trainHref },
            ]}
            current="Service status"
            subtitle={lineName(lineCode)}
          />
          <SettingsButton />
        </header>

        <ServiceStatusList lineCode={lineCode} />
      </div>
    </main>
  );
}
