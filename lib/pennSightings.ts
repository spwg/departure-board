import "server-only";
import type { Departure } from "./departures";
import { fixtureCircuitTable } from "./fixtures";
import { usingFixtures } from "./njtClient";
import { redisCommand } from "./njtTokenStore";
import {
  addToTable,
  circuitField,
  circuitObservations,
  circuitsByTrain,
  parseCircuitTable,
  withSightedTracks,
  type CircuitObservation,
  type CircuitTable,
  type RawVehicle,
} from "./platformSightings";

/**
 * Wires lib/platformSightings to live data: learns circuit/track pairs into
 * Upstash Redis and marks New York Penn departures with a sighted track.
 *
 * Sightings are a bonus on top of the board, never a dependency of it: any
 * failure here is logged and the board is returned exactly as NJT sent it.
 */

/** Only New York Penn posts tracks late enough for sightings to matter. */
export const SIGHTING_STATION = "NY";

const TABLE_KEY = "departure-board:penn-circuits:v1";
const SEEN_KEY_PREFIX = "departure-board:penn-circuits-seen:v1:";
/** A train number recurs daily; count its pairing again on a later day. */
const SEEN_TTL_SECONDS = 12 * 60 * 60;
/** How long an instance reuses the learned table before re-reading it. */
const TABLE_TTL_MS = 5 * 60_000;

/**
 * Counts one pair at most once per train per day across all instances, so a
 * train that sits on its platform through many board refreshes counts once.
 */
const RECORD_ONCE =
  "if redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[2]) then " +
  "return redis.call('HINCRBY', KEYS[1], ARGV[1], 1) else return 0 end";

let cachedTable: { at: number; table: CircuitTable } | null = null;
/** Pairs this instance has already sent, so Redis sees each one once. */
const recorded = new Set<string>();
const RECORDED_LIMIT = 5_000;

async function loadTable(): Promise<CircuitTable> {
  const now = Date.now();
  if (cachedTable && now - cachedTable.at < TABLE_TTL_MS) return cachedTable.table;
  const table = parseCircuitTable(await redisCommand<string[]>("HGETALL", TABLE_KEY));
  cachedTable = { at: now, table };
  return table;
}

async function record(
  observations: CircuitObservation[],
  table: CircuitTable,
): Promise<void> {
  if (recorded.size > RECORDED_LIMIT) recorded.clear();

  for (const { trainNumber, circuit, track } of observations) {
    const key = `${trainNumber}|${circuit}|${track}`;
    if (recorded.has(key)) continue;
    recorded.add(key);

    const counted = await redisCommand<number>(
      "EVAL",
      RECORD_ONCE,
      2,
      TABLE_KEY,
      `${SEEN_KEY_PREFIX}${key}`,
      circuitField(circuit, track),
      SEEN_TTL_SECONDS,
    );
    if (counted) addToTable(table, circuit, track);
  }
}

/**
 * Returns `departures` with sighted tracks added. `loadVehicles` is passed in
 * so the caller can wrap it in its own token-refresh handling.
 */
export async function addSightedTracks(
  departures: Departure[],
  loadVehicles: () => Promise<RawVehicle[]>,
): Promise<Departure[]> {
  try {
    const circuits = circuitsByTrain(await loadVehicles());
    if (circuits.size === 0) return departures;

    // Fixture runs have no Redis; they show a canned table instead of learning.
    if (usingFixtures()) {
      return withSightedTracks(departures, circuits, fixtureCircuitTable());
    }

    const table = await loadTable();
    await record(circuitObservations(departures, circuits), table);
    return withSightedTracks(departures, circuits, table);
  } catch (error) {
    console.error("Penn sighted tracks unavailable:", error);
    return departures;
  }
}
