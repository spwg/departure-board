import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
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
  if (!parseSubwayDepartureId(id) || !isSubwayRoute(subwayRoute)) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-hidden border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <PageHeader>
          <HomeButton />
          <PageTitle title="Service status" subtitle={`${subwayRoute} train`} />
          <SettingsButton />
        </PageHeader>

        <ServiceStatusList subwayRoute={subwayRoute} />
      </div>
    </main>
  );
}
