import Link from "next/link";
import type { TransitSystem } from "@/lib/boardChoices";
import { transferHref, transfersFromStop } from "@/lib/transfers";
import { SubwayRouteIcons } from "./SubwayRouteIcons";

/**
 * The connection affordance on one upcoming stop of an exact train.
 *
 * It appears only where a stop has known transfer destinations and opens each
 * target station board directly.
 */
export function TransferLinks({
  system,
  stationId,
}: {
  system: TransitSystem;
  stationId: string;
}) {
  const transfer = transfersFromStop(system, stationId);
  if (!transfer) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {transfer.targets.map((target) => (
        <Link
          key={`${target.choice.system}:${target.choice.stationId}`}
          href={transferHref(target.choice)}
          aria-label={`Transfer to ${target.label} at ${target.stationName}`}
          className="inline-flex items-center gap-1 rounded-full border border-edge px-2 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          <span>Transfer to</span>
          {target.choice.system === "subway" ? (
            <SubwayRouteIcons routes={target.label.split("/")} />
          ) : (
            <span>{target.label}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
