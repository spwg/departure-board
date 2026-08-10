import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SettingsButton } from "@/components/SettingsButton";
import { INTERCHANGES, getInterchange, interchangeHref } from "@/lib/interchanges";

export function generateStaticParams() {
  return INTERCHANGES.map(({ id }) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const interchange = getInterchange(id);
  return { title: interchange ? `${interchange.name} transfers` : "Interchange not found" };
}

/**
 * The Interchange landing page is a fast transfer chooser, not a live board.
 * It loads no provider data until the rider chooses the board they want.
 */
export default async function InterchangePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const interchange = getInterchange(id);
  if (!interchange) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
          <Breadcrumbs
            parents={[{ label: "Stations", href: "/" }]}
            current={interchange.name}
            subtitle="Transfers"
          />
          <SettingsButton />
        </header>

        <section aria-labelledby="transfer-heading">
          <div className="border-b border-edge px-4 py-4 sm:px-5">
            <h2 id="transfer-heading" className="text-sm font-semibold">Transfer to</h2>
            <p className="mt-1 text-sm text-muted">Choose the service you want to catch next.</p>
          </div>
          <ul className="divide-y divide-edge">
            {interchange.nodes.map((node) => (
              <li key={node.id}>
                <Link
                  href={interchangeHref(interchange, node)}
                  aria-label={`${node.label} departures at ${interchange.name}`}
                  className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold">{node.label}</span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {node.system === "subway" ? "Subway" : "NJ Transit rail"}
                      {node.routes.length > 0 && ` · ${node.routes.join(" · ")}`}
                    </span>
                  </span>
                  <span aria-hidden className="text-xl text-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
