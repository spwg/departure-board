import "server-only";
import { trainId } from "./boardLog";
import type { Departure, TrainPosition } from "./departures";
import { fixturePositionHistory, fixtureVehicles } from "./fixtures";
import { usingFixtures } from "./njtClient";
import { redisCommand } from "./njtTokenStore";
import { PREDICTIONS_TTL, loadPredictions, type PredictionSnapshot } from "./pennStore";
import { addToTable, readingsByTrain, withTrainPositions, type CircuitTable } from "./trainPositions";

/**
 * Predicted tracks for the New York Penn board, as the collector Worker last
 * published them (collector/worker.ts). The app only reads: it never calls the
 * vehicle feed or writes history, so riders' traffic costs one Redis read per
 * fresh board and nothing runs when nobody is looking.
 */

/** How long an instance reuses the predictions; the collector publishes every minute. */
const CACHE_MS = 15_000;
/**
 * How long an instance stops asking after a failed read. Predictions are
 * optional, so an unavailable Redis — down, or out of its monthly allowance —
 * costs one failed read and one log line per instance every few minutes, not
 * one per board.
 */
const FAILURE_BACKOFF_MS = 5 * 60_000;
let cached: { at: number; snapshot: PredictionSnapshot | null } | null = null;
/** The read in flight, so a burst of New York boards makes one Redis call. */
let loading: Promise<PredictionSnapshot | null> | null = null;
let failedAt: number | null = null;

/**
 * Adds each published prediction to its unposted departure. Posted tracks
 * always win, cancelled or departed trains get none, and predictions older
 * than their TTL — a stalled collector — are ignored.
 */
export function applyPredictions(
  departures: Departure[],
  snapshot: PredictionSnapshot | null,
  now: number,
): Departure[] {
  if (!snapshot || now - Date.parse(snapshot.at) > PREDICTIONS_TTL * 1000) return departures;
  return departures.map((departure) => {
    if (departure.track || departure.status === "cancelled" || departure.status === "departed") return departure;
    const position = snapshot.predictions[trainId(departure)];
    return position?.predictedTrack ? { ...departure, position } : departure;
  });
}

/** Sample predictions for fixture runs, made from the canned vehicles and history. */
function fixtureSnapshot(departures: Departure[], now: number): PredictionSnapshot {
  const table: CircuitTable = new Map();
  for (const { circuit, track } of fixturePositionHistory()) addToTable(table, circuit, track);
  const predictions: Record<string, TrainPosition> = {};
  for (const departure of withTrainPositions(departures, readingsByTrain(fixtureVehicles()), table)) {
    if (departure.position?.predictedTrack) predictions[trainId(departure)] = departure.position;
  }
  return { v: 1, at: new Date(now).toISOString(), predictions };
}

export async function addPredictions(departures: Departure[]): Promise<Departure[]> {
  const now = Date.now();
  if (usingFixtures()) return applyPredictions(departures, fixtureSnapshot(departures, now), now);
  if (failedAt !== null && now - failedAt < FAILURE_BACKOFF_MS) return departures;
  try {
    if (!cached || now - cached.at > CACHE_MS) {
      loading ??= loadPredictions(redisCommand).finally(() => {
        loading = null;
      });
      cached = { at: now, snapshot: await loading };
    }
    failedAt = null;
    return applyPredictions(departures, cached.snapshot, now);
  } catch (error) {
    failedAt = now;
    console.warn(`Penn predictions unavailable; retrying in ${FAILURE_BACKOFF_MS / 60_000} minutes:`, error instanceof Error ? error.message : error);
    return departures;
  }
}
