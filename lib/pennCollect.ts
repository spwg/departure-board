import {
  BOARD_LOG_VERSION,
  boardSnapshots,
  changeEvent,
  changeKey,
  firstEvent,
  goneEvent,
  logDay,
  logMinute,
  trainId,
  type BoardLogSource,
} from "./boardLog";
import { normalizeDepartures, type RawDeparture, type TrainPosition } from "./departures";
import { InvalidTokenError } from "./njtApi";
import {
  ageHistory,
  loadCollectorState,
  saveCollection,
  type CollectorState,
  type RedisCommand,
} from "./pennStore";
import {
  addToTable,
  circuitField,
  circuitObservations,
  flattenCircuitTable,
  parseCircuitTable,
  readingsByTrain,
  withTrainPositions,
  type CircuitTable,
  type RawVehicle,
  type VehicleReading,
} from "./trainPositions";

/** Only New York Penn posts tracks late enough for predictions to matter. */
export const PENN_STATION = "NY";

const SOURCE: BoardLogSource = "collector";

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
 * The board itself must load, or nothing is written. The vehicle feed is
 * best-effort: without it the collection still logs the board, marked as
 * unable to predict, and publishes no predictions. Redis is read once and
 * written once (lib/pennStore).
 */
export async function collectPenn(deps: CollectDeps): Promise<CollectSummary> {
  const at = new Date((deps.now ?? Date.now)()).toISOString();
  const today = logDay(at);

  // One token for both calls; a rejection by either replaces it once for both.
  const token = await deps.token.get();
  let replacement: Promise<string> | null = null;
  const withToken = async <T>(call: (token: string) => Promise<T>): Promise<T> => {
    try {
      return await call(token);
    } catch (error) {
      if (!(error instanceof InvalidTokenError)) throw error;
      replacement ??= deps.token.invalidate(error.token).then(() => deps.token.get());
      return call(await replacement);
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
  // Only the NY board's trains are positioned, predicted or recorded.
  const boardTrains = new Set(departures.map((departure) => departure.trainNumber));
  const readings: Map<string, VehicleReading> = rawVehicles ? readingsByTrain(rawVehicles, boardTrains) : new Map();

  const previous = await loadCollectorState(deps.redis);
  const state: CollectorState = { ...previous, trains: {} };

  // The history is only needed to predict, so only when the vehicle feed
  // answered. It is aged out of its window on the day's first such run and
  // otherwise carried in the state, since this collector is its only writer.
  // Even when no board train is running yet the history still loads, so a
  // quiet night counts as healthy rather than as a failed run.
  let table: CircuitTable = new Map();
  if (rawVehicles) {
    if (previous.table === null || previous.tableDay !== today) {
      state.table = await ageHistory(deps.redis, Date.parse(at));
      state.tableDay = today;
    }
    table = parseCircuitTable(state.table);
  }

  // Each pairing is recorded once per train, however many minutes it stands there.
  const pairings: string[] = [];
  const seen = new Map<string, string[]>();
  for (const observation of circuitObservations(departures, readings)) {
    const id = trainId(observation);
    const field = circuitField(observation.circuit, observation.track);
    const fields = seen.get(id) ?? previous.trains[id]?.seen ?? [];
    if (!fields.includes(field)) {
      pairings.push(field);
      addToTable(table, observation.circuit, observation.track);
    }
    seen.set(id, fields.includes(field) ? fields : [...fields, field]);
  }
  if (rawVehicles) state.table = flattenCircuitTable(table);

  const board = withTrainPositions(departures, readings, table);
  const predictions: Record<string, TrainPosition> = {};
  for (const departure of board) {
    if (departure.position?.predictedTrack) predictions[trainId(departure)] = departure.position;
  }

  // A train's full entry when it is new, a change entry when what riders see
  // differs from what was last logged, and a gone entry once it leaves.
  const entries: string[] = [];
  for (const snapshot of boardSnapshots(board, readings, table)) {
    const last = previous.trains[snapshot.id];
    const key = hashKey(changeKey(snapshot));
    if (!last) entries.push(JSON.stringify(firstEvent(at, SOURCE, snapshot)));
    else if (last.key !== key) entries.push(JSON.stringify(changeEvent(at, SOURCE, snapshot)));
    state.trains[snapshot.id] = { key, seen: seen.get(snapshot.id) ?? last?.seen ?? [] };
  }
  for (const id of Object.keys(previous.trains)) {
    if (!state.trains[id]) entries.push(JSON.stringify(goneEvent(at, SOURCE, id)));
  }

  // A collection missing the vehicle feed can predict nothing, so it is
  // counted apart from a healthy one.
  const status = rawVehicles ? "ok" : "no-vehicles";
  const setPairingsExpiry = pairings.length > 0 && previous.pairingsDay !== today;
  if (setPairingsExpiry) state.pairingsDay = today;
  const setPollsExpiry = previous.pollsDay !== today;
  state.pollsDay = today;

  const logged = await saveCollection(deps.redis, {
    predictions: { v: BOARD_LOG_VERSION, at, predictions },
    pairings,
    entries,
    pollField: `${logMinute(at)}:${SOURCE}:${status}`,
    setPollsExpiry,
    setPairingsExpiry,
    state,
  });

  return {
    event: "penn-collect",
    at,
    departures: departures.length,
    predicted: Object.keys(predictions).length,
    recorded: pairings.length,
    logged,
    vehicles: rawVehicles !== null,
    history: rawVehicles !== null,
  };
}

/**
 * A 53-bit hash (cyrb53) of a change key. The state keeps only this per train
 * rather than the key itself, which keeps the state small enough to read and
 * write every minute.
 */
export function hashKey(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
