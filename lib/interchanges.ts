import type { TransitSystem } from "./boardChoices";

/**
 * One provider-owned boarding location inside an Interchange.
 *
 * A node can be a provider station or a line group within a provider station.
 * That distinction is important at places such as 14 St, where the A/C/E and
 * L services are both Subway boards but are different transfer targets.
 */
export type TransferNode = {
  id: string;
  label: string;
  system: TransitSystem;
  stationIds: string[];
  routes: string[];
};

/** A permitted origin-to-target connection inside one Interchange. */
export type TransferOption = {
  from: string;
  to: string;
};

/**
 * A rider-recognized transfer hub among provider-owned stations and line
 * groups. It owns navigation relationships only — never live data or a
 * combined departure feed.
 */
export type Interchange = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  nodes: TransferNode[];
  transfers: TransferOption[];
};

function reciprocalTransfers(nodeIds: string[]): TransferOption[] {
  return nodeIds.flatMap((from) =>
    nodeIds
      .filter((to) => to !== from)
      .map((to) => ({ from, to })),
  );
}

export const INTERCHANGES: Interchange[] = [
  {
    id: "penn",
    name: "New York Penn Station",
    latitude: 40.750569,
    longitude: -73.993519,
    nodes: [
      { id: "njt", label: "NJT", system: "njt", stationIds: ["NY"], routes: [] },
      { id: "123", label: "1/2/3", system: "subway", stationIds: ["128"], routes: ["1", "2", "3"] },
      { id: "ace", label: "A/C/E", system: "subway", stationIds: ["A28"], routes: ["A", "C", "E"] },
    ],
    // Reciprocal edges are explicit so a future hub can describe a
    // one-direction-only connection without changing the model.
    transfers: reciprocalTransfers(["njt", "123", "ace"]),
  },
  {
    id: "14-st",
    name: "14 St",
    latitude: 40.740335,
    longitude: -74.002134,
    nodes: [
      { id: "ace", label: "A/C/E", system: "subway", stationIds: ["A31"], routes: ["A", "C", "E"] },
      { id: "l", label: "L", system: "subway", stationIds: ["L01"], routes: ["L"] },
    ],
    transfers: reciprocalTransfers(["ace", "l"]),
  },
  {
    id: "columbus-circle",
    name: "59 St-Columbus Circle",
    latitude: 40.7682,
    longitude: -73.9822,
    nodes: [
      { id: "ace", label: "A/C/B/D", system: "subway", stationIds: ["A24"], routes: ["A", "C", "B", "D"] },
      { id: "1", label: "1", system: "subway", stationIds: ["125"], routes: ["1"] },
    ],
    transfers: reciprocalTransfers(["ace", "1"]),
  },
];

export function getInterchange(id: string): Interchange | undefined {
  return INTERCHANGES.find((interchange) => interchange.id === id);
}

export function getTransferNode(
  interchange: Interchange,
  nodeId: string,
): TransferNode | undefined {
  return interchange.nodes.find((node) => node.id === nodeId);
}

export function transferTargets(
  interchange: Interchange,
  fromNodeId: string,
): TransferNode[] {
  const targetIds = interchange.transfers
    .filter((transfer) => transfer.from === fromNodeId)
    .map((transfer) => transfer.to);
  return targetIds
    .map((targetId) => getTransferNode(interchange, targetId))
    .filter((node): node is TransferNode => node !== undefined);
}

/** The Interchange and exact node reached by a provider station identity. */
export function interchangeForStation(
  system: TransitSystem,
  stationId: string,
): { interchange: Interchange; node: TransferNode } | null {
  for (const interchange of INTERCHANGES) {
    for (const node of interchange.nodes) {
      if (node.system === system && node.stationIds.includes(stationId)) {
        return { interchange, node };
      }
    }
  }
  return null;
}

/** The URL of one provider-owned Interchange node board. */
export function interchangeHref(
  interchange: Interchange,
  node: TransferNode,
): string {
  return `/interchange/${interchange.id}/${node.id}`;
}
