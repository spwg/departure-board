import "server-only";
import { boardSnapshots, type BoardLogSource } from "./boardLog";
import { logBoard } from "./boardLogStore";
import type { Departure } from "./departures";
import { loadCircuitTable, recordObservations } from "./pennPositionStore";
import {
  circuitObservations,
  readingsByTrain,
  withTrainPositions,
  type CircuitTable,
  type VehicleReading,
  type RawVehicle,
} from "./trainPositions";

/** Only New York Penn posts tracks late enough for positions to matter. */
export const POSITION_STATION = "NY";

/**
 * Adds live train positions and predicted tracks to a New York Penn board,
 * keeps the position history up to date, and logs what the board shows.
 *
 * Each layer is best-effort: the position needs only the vehicle feed, and is
 * attached even when the history store is unavailable; the predicted track is
 * added on top when Redis answers; the board log never holds up or breaks the
 * board. Any vehicle-feed failure returns the board exactly as NJT sent it.
 * `loadVehicles` is passed in so the caller can wrap it in its own
 * token-refresh handling.
 */
export async function addTrainPositions(
  departures: Departure[],
  loadVehicles: () => Promise<RawVehicle[]>,
  source: BoardLogSource = "board",
): Promise<Departure[]> {
  let readings = new Map<string, VehicleReading>();
  let vehicles = true;
  try {
    readings = readingsByTrain(await loadVehicles());
  } catch (error) {
    vehicles = false;
    console.error("Penn train positions unavailable:", error);
  }

  let table: CircuitTable = new Map();
  let history = false;
  let board = departures;
  if (readings.size > 0) {
    try {
      await recordObservations(circuitObservations(departures, readings));
      table = await loadCircuitTable();
      history = true;
    } catch (error) {
      console.error("Penn position history unavailable:", error);
    }
    board = withTrainPositions(departures, readings, table);
  }

  try {
    await logBoard(boardSnapshots(board, readings, table), { source, vehicles, history });
  } catch (error) {
    console.error("Penn board log unavailable:", error);
  }
  return board;
}
