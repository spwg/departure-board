import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SettingsButton } from "@/components/SettingsButton";
import { StopList } from "@/components/StopList";
import { isExcludedTrainId } from "@/lib/departures";
import { getStation } from "@/lib/stations";

/**
 * Not prerendered, unlike the station shells: train numbers are reassigned
 * daily and there is no fixed set of them to generate. `loading.tsx` supplies
 * the Suspense boundary the runtime params need.
 */
export async function generateMetadata({
  params,
}: PageProps<"/train/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Train ${decodeURIComponent(id)} stops` };
}

export default async function TrainPage({
  params,
  searchParams,
}: PageProps<"/train/[id]">) {
  const { id } = await params;
  const train = decodeURIComponent(id).trim();
  // This app shows NJ Transit trains only, however you arrive at the page.
  if (!train || isExcludedTrainId(train)) notFound();

  // Which board sent you here, so the remaining-route list can mark where you
  // are standing; an unknown code degrades quietly.
  const { from } = await searchParams;
  const origin = typeof from === "string" ? getStation(from) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-hidden border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
          <Breadcrumbs
            parents={[
              { label: "Stations", href: "/" },
              ...(origin ? [{ label: origin.name, href: `/station/${origin.code}` }] : []),
            ]}
            current={`Train ${train}`}
          />
          <SettingsButton />
        </header>

        <StopList train={train} from={origin?.code ?? ""} />
      </div>
    </main>
  );
}
