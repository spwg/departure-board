import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/PageTitle";
import { ServiceStatusList } from "@/components/ServiceStatus";
import { SettingsButton } from "@/components/SettingsButton";
import { HomeButton } from "@/components/StationHeader";
import { isSubwayRoute, parseSubwayDepartureId } from "@/lib/subway";

export async function generateMetadata({
  searchParams,
}: PageProps<"/subway/train/[id]/status">): Promise<Metadata> {
  const { route } = await searchParams;
  return { title: typeof route === "string" ? `${route} train service status` : "Service status" };
}

/**
 * MTA's alerts for a Subway train's route, kept off its remaining stops the
 * way an NJ Transit train's notices are. The train page links here once it
 * knows the route.
 */
export default async function SubwayTrainServiceStatusPage({
  params,
  searchParams,
}: PageProps<"/subway/train/[id]/status">) {
  const { id } = await params;
  const { route } = await searchParams;
  const subwayRoute = typeof route === "string" ? route.toUpperCase() : "";
  if (!parseSubwayDepartureId(decodeURIComponent(id)) || !isSubwayRoute(subwayRoute)) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-hidden border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
          <HomeButton />
          <PageTitle title="Service status" subtitle={`${subwayRoute} train`} />
          <SettingsButton />
        </header>

        <ServiceStatusList subwayRoute={subwayRoute} />
      </div>
    </main>
  );
}
