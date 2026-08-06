import type { TransitSystem } from "./boardChoices";
import {
  interchangeForStation,
  type Interchange,
  type InterchangeView,
} from "./interchanges";

/**
 * The exact train a transfer board's starting time follows.
 *
 * Deliberately the train and not a copied timestamp: the cutoff has to move
 * when the originating train's live expected arrival moves, or a delay would
 * leave already-departed trains in the transfer view.
 */
export type TransferOrigin = {
  system: TransitSystem;
  /** An NJT train number, or a provider-qualified MTA trip identity. */
  trainRef: string;
};

const SEPARATOR = "|";

export function encodeTransferOrigin(origin: TransferOrigin): string {
  return `${origin.system}${SEPARATOR}${origin.trainRef}`;
}

/** Reads the `after` parameter. Anything unrecognised is simply no cutoff. */
export function parseTransferOrigin(value: string | null): TransferOrigin | null {
  if (!value) return null;
  const separator = value.indexOf(SEPARATOR);
  if (separator === -1) return null;
  const system = value.slice(0, separator);
  const trainRef = value.slice(separator + 1);
  if (!trainRef) return null;
  return system === "njt" || system === "subway" ? { system, trainRef } : null;
}

/** The URL of one Interchange view, optionally starting after a given train. */
export function transferHref(
  interchange: Interchange,
  view: InterchangeView,
  origin?: TransferOrigin,
): string {
  const base = `/interchange/${interchange.id}/${view.system}`;
  return origin
    ? `${base}?after=${encodeURIComponent(encodeTransferOrigin(origin))}`
    : base;
}

/**
 * The other systems a rider can transfer to from one upcoming stop.
 *
 * Empty for a stop that belongs to no Interchange, which is most of them —
 * this is what keeps the affordance off every other row of a route.
 */
export function transfersFromStop(
  system: TransitSystem,
  stationId: string,
): { interchange: Interchange; views: InterchangeView[] } | null {
  const found = interchangeForStation(system, stationId);
  if (!found) return null;
  const views = found.interchange.views.filter((view) => view.system !== system);
  return views.length > 0 ? { interchange: found.interchange, views } : null;
}
