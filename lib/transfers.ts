import type { TransitSystem } from "./boardChoices";
import {
  getTransferNode,
  interchangeForStation,
  transferTargets,
  type Interchange,
  type TransferNode,
} from "./interchanges";

/**
 * The exact train and Interchange node that a transfer board follows.
 *
 * The node is part of the identity because one hub can contain several
 * provider stations. A timestamp alone cannot tell us where the originating
 * train arrives.
 */
export type TransferOrigin = {
  nodeId: string;
  trainRef: string;
};

const SEPARATOR = "|";

export function encodeTransferOrigin(origin: TransferOrigin): string {
  return `${origin.nodeId}${SEPARATOR}${origin.trainRef}`;
}

/** Reads the `after` parameter. Anything unrecognised is simply no cutoff. */
export function parseTransferOrigin(value: string | null): TransferOrigin | null {
  if (!value) return null;
  const separator = value.indexOf(SEPARATOR);
  if (separator === -1) return null;
  const nodeId = value.slice(0, separator);
  const trainRef = value.slice(separator + 1);
  if (!nodeId || !trainRef) return null;
  return { nodeId, trainRef };
}

/** The URL of one Interchange node, optionally starting after a train. */
export function transferHref(
  interchange: Interchange,
  node: TransferNode,
  origin?: TransferOrigin,
): string {
  const base = `/interchange/${interchange.id}/${node.id}`;
  return origin
    ? `${base}?after=${encodeURIComponent(encodeTransferOrigin(origin))}`
    : base;
}

/**
 * The transfer targets available from one upcoming stop of an exact train.
 * The result preserves the originating node so the live arrival lookup stays
 * tied to the station where that train actually arrives.
 */
export function transfersFromStop(
  system: TransitSystem,
  stationId: string,
): { interchange: Interchange; from: TransferNode; targets: TransferNode[] } | null {
  const found = interchangeForStation(system, stationId);
  if (!found) return null;
  const targets = transferTargets(found.interchange, found.node.id);
  return targets.length > 0
    ? { interchange: found.interchange, from: found.node, targets }
    : null;
}

/** Resolves a transfer origin to its provider-owned node inside this hub. */
export function transferOriginNode(
  interchange: Interchange,
  origin: TransferOrigin | null,
): TransferNode | undefined {
  return origin ? getTransferNode(interchange, origin.nodeId) : undefined;
}
