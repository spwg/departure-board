import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InterchangeBoard } from "@/components/InterchangeBoard";
import { FavoriteButton } from "@/components/FavoriteButton";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { njtBoardChoice, subwayBoardChoice } from "@/lib/boardChoices";
import {
  INTERCHANGES,
  getInterchange,
  interchangeHref,
  interchangeView,
} from "@/lib/interchanges";

/**
 * The active system lives in the path rather than a query string so both views
 * of every Interchange prerender, the way the station shells do.
 */
export function generateStaticParams() {
  return INTERCHANGES.flatMap((interchange) =>
    interchange.views.map((view) => ({ id: interchange.id, system: view.system })),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; system: string }> }): Promise<Metadata> {
  const { id, system } = await params;
  const interchange = getInterchange(id);
  if (!interchange) return { title: "Interchange not found" };
  return { title: `${interchange.name} ${interchangeView(interchange, system).label} departures` };
}

/**
 * One Interchange, one system's board at a time.
 *
 * The switch changes which member system is showing; it never merges them.
 * Each board owns its own loading, retry, freshness and alert state, so an
 * MTA outage leaves the rail board alone and vice versa — which is only true
 * because exactly one of them is mounted at a time and neither shares state
 * with the other.
 */
export default async function InterchangePage({
  params,
}: {
  params: Promise<{ id: string; system: string }>;
}) {
  const { id, system } = await params;
  const interchange = getInterchange(id);
  if (!interchange || !interchange.views.some((view) => view.system === system)) notFound();

  const active = interchangeView(interchange, system);
  const choice = active.system === "njt"
    ? njtBoardChoice(active.stationIds[0]!)
    : subwayBoardChoice(active.stationIds[0]!);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 border-b border-edge bg-surface/85 backdrop-blur-md sm:static">
          <div className="flex items-center gap-1 px-2 py-2.5 sm:px-3">
            <Link
              href="/"
              aria-label="All stations"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </Link>
            <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold tracking-tight sm:text-lg">
              {interchange.name}
            </h1>
            <FavoriteButton choice={choice} name={`${interchange.name} ${active.label}`} />
          </div>

          {/* The System chip belongs here, on a mixed control, and never on the
              single-system rows of the board below it. */}
          <nav aria-label="Departure board system" className="flex gap-1 px-2 pb-2 sm:px-3">
            {interchange.views.map((view) => (
              <Link
                key={view.system}
                href={interchangeHref(interchange, view)}
                aria-current={view.system === active.system ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${
                  view.system === active.system
                    ? "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                    : "text-muted hover:bg-bg hover:text-text"
                }`}
              >
                {view.label}
              </Link>
            ))}
          </nav>
        </header>

        {/* Keyed by system so switching remounts the board rather than showing
            one system's departures under the other's heading. */}
        <Suspense key={active.system} fallback={<p className="px-5 py-16 text-center text-muted">Loading live departures…</p>}>
          <InterchangeBoard interchangeId={interchange.id} system={active.system} />
        </Suspense>
        <RecentStationRecorder choice={choice} />
      </div>
    </main>
  );
}
