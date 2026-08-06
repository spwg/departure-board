import Link from "next/link";
import type { TransitSystem } from "@/lib/boardChoices";
import { transferHref, transfersFromStop } from "@/lib/transfers";

/**
 * The connection affordance on one upcoming stop of an exact train.
 *
 * It appears only where a stop belongs to an Interchange, and it opens the
 * other system's board starting after this train's own live arrival. It makes
 * no claim about whether the transfer is catchable — no walking time, no
 * platform or avenue coaching — because that is the rider's call.
 */
export function TransferLinks({
  system,
  stationId,
  trainRef,
}: {
  system: TransitSystem;
  stationId: string;
  trainRef: string;
}) {
  const transfer = transfersFromStop(system, stationId);
  if (!transfer) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {transfer.views.map((view) => (
        <Link
          key={view.system}
          href={transferHref(transfer.interchange, view, { system, trainRef })}
          aria-label={`${view.label} departures from ${transfer.interchange.name} after this train arrives`}
          className="rounded-full border border-edge px-2 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {view.label} departures after arrival
        </Link>
      ))}
    </div>
  );
}
