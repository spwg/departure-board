import {
  boardChoiceKey,
  njtBoardChoice,
  subwayBoardChoice,
  type BoardChoice,
  type TransitSystem,
} from "./boardChoices";

/** One station board that a rider can open from a departure's stop. */
export type TransferTarget = {
  choice: BoardChoice;
  stationName: string;
  label: string;
};

type StationTransfer = {
  from: BoardChoice;
  target: TransferTarget;
};

const target = (
  choice: BoardChoice,
  stationName: string,
  label: string,
): TransferTarget => ({ choice, stationName, label });

/**
 * Transfers are direct links between station boards. The same station may
 * have several provider-owned boards, and a transfer simply opens the target
 * board; no extra hub page or combined feed is needed.
 */
const STATION_TRANSFERS: StationTransfer[] = [
  { from: njtBoardChoice("NY"), target: target(subwayBoardChoice("128"), "New York Penn Station", "1/2/3") },
  { from: njtBoardChoice("NY"), target: target(subwayBoardChoice("A28"), "New York Penn Station", "A/C/E") },
  { from: subwayBoardChoice("128"), target: target(njtBoardChoice("NY"), "New York Penn Station", "NJT") },
  { from: subwayBoardChoice("128"), target: target(subwayBoardChoice("A28"), "New York Penn Station", "A/C/E") },
  { from: subwayBoardChoice("A28"), target: target(njtBoardChoice("NY"), "New York Penn Station", "NJT") },
  { from: subwayBoardChoice("A28"), target: target(subwayBoardChoice("128"), "New York Penn Station", "1/2/3") },
  { from: subwayBoardChoice("A31"), target: target(subwayBoardChoice("L01"), "14 St", "L") },
  { from: subwayBoardChoice("L01"), target: target(subwayBoardChoice("A31"), "14 St", "A/C/E") },
  { from: subwayBoardChoice("A24"), target: target(subwayBoardChoice("125"), "59 St-Columbus Circle", "1") },
  { from: subwayBoardChoice("125"), target: target(subwayBoardChoice("A24"), "59 St-Columbus Circle", "A/C/B/D") },
];

/** The URL of one station board. */
export function transferHref(targetBoard: BoardChoice): string {
  const base = targetBoard.system === "njt"
    ? `/station/${encodeURIComponent(targetBoard.stationId)}`
    : `/subway/station/${encodeURIComponent(targetBoard.stationId)}`;
  return base;
}

/** The transfer targets available from one upcoming stop. */
export function transfersFromStop(
  system: TransitSystem,
  stationId: string,
): { from: BoardChoice; targets: TransferTarget[] } | null {
  const from = system === "njt"
    ? njtBoardChoice(stationId)
    : subwayBoardChoice(stationId);
  const targets = STATION_TRANSFERS
    .filter((transfer) => boardChoiceKey(transfer.from) === boardChoiceKey(from))
    .map((transfer) => transfer.target);
  return targets.length > 0 ? { from, targets } : null;
}
