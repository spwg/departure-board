import { BOARD_LOG_VERSION, boardSnapshots, trainId } from "./boardLog";
import { normalizeDepartures, type RawDeparture, type TrainPosition } from "./departures";
import { InvalidTokenError } from "./njtApi";
import { logBoard, recordHistory, type RedisCommand } from "./pennStore";
import {
  circuitObservations,
  readingsByTrain,
  withTrainPositions,
  type CircuitTable,
  type RawVehicle,
  type VehicleReading,
} from "./trainPositions";

/** Only New York Penn posts tracks late enough for predictions to matter. */
export const PENN_STATION = "NY";

export type CollectDeps = {
  redis: RedisCommand;
  /** The shared RailData token, and how to drop one NJT rejected. */
  token: { get(): Promise<string>; invalidate(token: string): Promise<void> };
  njt: {
    departures(token: string, station: string): Promise<RawDeparture[]>;
    vehicles(token: string): Promise<RawVehicle[]>;
  };
  now?: () => number;
};

export type CollectSummary = {
  event: "penn-collect";
  at: string;
  departures: number;
  predicted: number;
  recorded: number;
  logged: number;
  vehicles: boolean;
  history: boolean;
};

/**
 * One New York Penn collection, run by the collector Worker every minute:
 * loads the NY board and every train's position from NJ Transit, records new
 * circuit/track pairings, predicts tracks for unposted trains, logs what the
 * board shows, and publishes the predictions for the app to read.
 *
 * The board itself must load, or nothing is written. The vehicle feed and the
 * history are best-effort: without them the collection still logs the board,
 * marked as unable to predict, and publishes no predictions.
 */
export async function collectPenn(deps: CollectDeps): Promise<CollectSummary> {
  const at = new Date((deps.now ?? Date.now)()).toISOString();

  const withToken = async <T>(call: (token: string) => Promise<T>): Promise<T> => {
    const token = await deps.token.get();
    try {
      return await call(token);
    } catch (error) {
      if (!(error instanceof InvalidTokenError)) throw error;
      await deps.token.invalidate(error.token);
      return call(await deps.token.get());
    }
  };

  const [rawDepartures, rawVehicles] = await Promise.all([
    withToken((token) => deps.njt.departures(token, PENN_STATION)),
    withToken((token) => deps.njt.vehicles(token)).catch((error: unknown) => {
      console.error("Penn vehicle feed unavailable:", error);
      return null;
    }),
  ]);
  const departures = normalizeDepartures(rawDepartures);
  const readings: Map<string, VehicleReading> = rawVehicles ? readingsByTrain(rawVehicles) : new Map();

  let table: CircuitTable = new Map();
  let recorded = 0;
  let history = false;
  if (readings.size > 0) {
    try {
      ({ recorded, table } = await recordHistory(deps.redis, circuitObservations(departures, readings), Date.parse(at)));
      history = true;
    } catch (error) {
      console.error("Penn position history unavailable:", error);
    }
  }

  const board = withTrainPositions(departures, readings, history ? table : new Map());
  const predictions: Record<string, TrainPosition> = {};
  for (const departure of board) {
    if (departure.position?.predictedTrack) predictions[trainId(departure)] = departure.position;
  }

  const logged = await logBoard(
    deps.redis,
    boardSnapshots(board, readings, table),
    { v: BOARD_LOG_VERSION, at, predictions },
    { vehicles: rawVehicles !== null, history },
  );

  return {
    event: "penn-collect",
    at,
    departures: departures.length,
    predicted: Object.keys(predictions).length,
    recorded,
    logged,
    vehicles: rawVehicles !== null,
    history,
  };
}
