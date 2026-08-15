import Link from "next/link";
import type { TransitSystem } from "@/lib/boardChoices";
import { transferHref, transfersFromStop } from "@/lib/transfers";
import { SubwayRouteIcons } from "./SubwayRouteIcons";

/** Compact peer-station controls shown above a board when transfers are known. */
export function StationTransferLinks({
  system,
  stationId,
}: {
  system: TransitSystem;
  stationId: string;
}) {
  const transfer = transfersFromStop(system, stationId);
  if (!transfer) return null;

  return (
    <nav aria-label="Transfer options" className="flex items-center gap-2 overflow-x-auto border-b border-edge bg-bg px-3 py-2 sm:px-5">
      <span className="shrink-0 px-1 text-sm font-medium text-text">Transfer to:</span>
      {transfer.targets.map((target) => (
        <Link
          key={`${target.choice.system}:${target.choice.stationId}`}
          href={transferHref(target.choice)}
          aria-label={`Transfer to ${target.label} trains at ${target.stationName}`}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-800 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-100 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current active:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200 dark:hover:border-blue-700 dark:hover:bg-blue-900"
        >
          {target.choice.system === "subway" ? (
            <SubwayRouteIcons routes={target.label.split("/")} size="md" />
          ) : (
            <span>{target.label}</span>
          )}
          <span>trains</span>
        </Link>
      ))}
    </nav>
  );
}
