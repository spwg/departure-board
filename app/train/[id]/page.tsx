import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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

  // Which board sent you here. Only used to point the back arrow home and to
  // mark where you are standing, so an unknown code degrades quietly.
  const { from } = await searchParams;
  const origin = typeof from === "string" ? getStation(from) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-hidden border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
          <Link
            href={origin ? `/station/${origin.code}` : "/?pick=1"}
            aria-label={origin ? `Back to ${origin.name}` : "All stations"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>

          <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold tracking-tight sm:text-lg">
            Train {train}
          </h1>

          {/* Balances the back arrow so the title stays centred. */}
          <span aria-hidden className="h-10 w-10 shrink-0" />
        </header>

        <StopList train={train} from={origin?.code ?? ""} />
      </div>
    </main>
  );
}
