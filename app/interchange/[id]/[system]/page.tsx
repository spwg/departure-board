import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { InterchangeBoard } from "@/components/InterchangeBoard";
import { FavoriteButton } from "@/components/FavoriteButton";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { SettingsButton } from "@/components/SettingsButton";
import { njtBoardChoice, subwayBoardChoice } from "@/lib/boardChoices";
import {
  INTERCHANGES,
  getInterchange,
  getTransferNode,
  transferTargets,
} from "@/lib/interchanges";
import { transferHref } from "@/lib/transfers";

/**
 * The active transfer node lives in the path rather than a query string so
 * every provider-owned board prerenders, the way the station shells do.
 */
export function generateStaticParams() {
  return INTERCHANGES.flatMap((interchange) =>
    interchange.nodes.map((node) => ({ id: interchange.id, system: node.id })),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; system: string }> }): Promise<Metadata> {
  const { id, system } = await params;
  const interchange = getInterchange(id);
  if (!interchange) return { title: "Interchange not found" };
  const node = getTransferNode(interchange, system);
  return { title: node ? `${interchange.name} ${node.label} departures` : "Transfer node not found" };
}

/** One Interchange, one provider-owned transfer node at a time. */
export default async function InterchangePage({
  params,
}: {
  params: Promise<{ id: string; system: string }>;
}) {
  const { id, system } = await params;
  const interchange = getInterchange(id);
  // Keep the old provider-level Subway URL from becoming a misleading board.
  // It used to combine several provider stations; the new model asks the
  // rider to choose an explicit node instead.
  if (interchange && system === "subway") redirect(`/interchange/${id}`);
  const active = interchange ? getTransferNode(interchange, system) : undefined;
  if (!interchange || !active) notFound();

  const choice = active.system === "njt"
    ? njtBoardChoice(active.stationIds[0]!)
    : subwayBoardChoice(active.stationIds[0]!);
  const targets = transferTargets(interchange, active.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 border-b border-edge bg-surface/85 backdrop-blur-md sm:static">
          <div className="flex items-center gap-1 px-2 py-2.5 sm:px-3">
            <Breadcrumbs
              parents={[
                { label: "Stations", href: "/" },
                { label: interchange.name, href: `/interchange/${interchange.id}` },
              ]}
              current={`${active.label} departures`}
              subtitle={active.system === "subway" ? "Subway" : "NJ Transit rail"}
            />
            <SettingsButton />
            <FavoriteButton choice={choice} name={`${interchange.name} ${active.label}`} />
          </div>

          {targets.length > 0 && (
            <nav aria-label="Transfer options" className="flex items-center gap-1 overflow-x-auto px-2 pb-2 sm:px-3">
              <span className="shrink-0 px-1 text-xs font-medium text-muted">Transfer to</span>
              {targets.map((target) => (
                <Link
                  key={target.id}
                  href={transferHref(interchange, target)}
                  className="shrink-0 rounded-full border border-edge px-3 py-1 text-sm font-semibold text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                >
                  {target.label}
                </Link>
              ))}
            </nav>
          )}
        </header>

        <Suspense key={active.id} fallback={<p className="px-5 py-16 text-center text-muted">Loading live departures…</p>}>
          <InterchangeBoard interchangeId={interchange.id} nodeId={active.id} />
        </Suspense>
        <RecentStationRecorder choice={choice} />
      </div>
    </main>
  );
}
