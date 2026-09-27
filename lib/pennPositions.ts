import "server-only";
import type { Departure } from "./departures";
import { loadCircuitTable, recordObservations } from "./pennPositionStore";
import {
  circuitObservations,
  readingsByTrain,
  withTrainPositions,
  type CircuitTable,
  type RawVehicle,
} from "./trainPositions";

/** Only New York Penn posts tracks late enough for positions to matter. */
export const POSITION_STATION = "NY";

/**
 * Adds live train positions to a New York Penn board and keeps the position
 * history up to date.
 *
 * Two independent layers, each best-effort: the raw position needs only the
 * vehicle feed, and shows even when the history store is unavailable; the
 * history-backed platform is added on top when Redis answers. Any vehicle-feed
 * failure returns the board exactly as NJT sent it. `loadVehicles` is passed
 * in so the caller can wrap it in its own token-refresh handling.
 */
export async function addTrainPositions(
  departures: Departure[],
  loadVehicles: () => Promise<RawVehicle[]>,
): Promise<Departure[]> {
  let readings;
  try {
    readings = readingsByTrain(await loadVehicles());
  } catch (error) {
    console.error("Penn train positions unavailable:", error);
    return departures;
  }
  if (readings.size === 0) return departures;

  let table: CircuitTable = new Map();
  try {
    await recordObservations(circuitObservations(departures, readings));
    table = await loadCircuitTable();
  } catch (error) {
    console.error("Penn position history unavailable:", error);
  }
  return withTrainPositions(departures, readings, table);
}
