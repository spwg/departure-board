import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PositionHistory } from "@/components/PositionHistory";
import { SettingsButton } from "@/components/SettingsButton";
import { isExcludedTrainId } from "@/lib/departures";
import { loadPositionHistory } from "@/lib/pennPositionStore";
import { getStation } from "@/lib/stations";
import { summarizeCircuit, type CircuitSummary, type PositionEvent } from "@/lib/trainPositions";

export async function generateMetadata({
  params,
}: PageProps<"/train/[id]/positions">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Train ${decodeURIComponent(id)} Penn track history` };
}

/**
 * The New York Penn position history behind the board's early platforms: every
 * time a train with a posted track was seen on a signal circuit, and what each
 * circuit has led to. Reached from the train page's header.
 */
export default async function TrainPositionsPage({
  params,
  searchParams,
}: PageProps<"/train/[id]/positions">) {
  const { id } = await params;
  const train = decodeURIComponent(id).trim();
  if (!train || isExcludedTrainId(train)) notFound();

  const { from } = await searchParams;
  const origin = typeof from === "string" ? getStation(from) : undefined;
  const trainHref = `/train/${encodeURIComponent(train)}${origin ? `?from=${origin.code}` : ""}`;

  let history: { events: PositionEvent[]; circuits: CircuitSummary[] } | null = null;
  try {
    const { table, events } = await loadPositionHistory();
    const circuits = [...table.keys()]
      .map((circuit) => summarizeCircuit(table, circuit))
      .sort((a, b) => b.total - a.total || a.circuit.localeCompare(b.circuit));
    history = { events, circuits };
  } catch (error) {
    console.error("Penn position history unavailable:", error);
  }

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
            current="Penn track history"
          />
          <SettingsButton />
        </header>

        {history ? (
          <PositionHistory train={train} events={history.events} circuits={history.circuits} />
        ) : (
          <p className="px-5 py-16 text-center text-muted">
            Track history is unavailable right now.
          </p>
        )}
      </div>
    </main>
  );
}
