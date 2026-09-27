import "server-only";
import { fixturePositionHistory } from "./fixtures";
import { usingFixtures } from "./njtClient";
import { redisCommand } from "./njtTokenStore";
import {
  addToTable,
  circuitField,
  parseCircuitTable,
  type CircuitObservation,
  type CircuitTable,
  type PositionEvent,
} from "./trainPositions";

export type { PositionEvent };

/**
 * New York Penn position history in Upstash Redis, the same database that holds
 * the NJT token:
 *
 *  - a hash of circuit/track pair counts, which is what the board consults, and
 *  - a capped list of the individual pairings, newest first, for the history
 *    page.
 *
 * Fixture runs have no Redis and read a canned history instead.
 */

const TABLE_KEY = "departure-board:penn-circuits:v1";
const EVENTS_KEY = "departure-board:penn-circuit-events:v1";
const SEEN_KEY_PREFIX = "departure-board:penn-circuits-seen:v1:";
/** A train number recurs daily; record its pairing again on a later day. */
const SEEN_TTL_SECONDS = 12 * 60 * 60;
/** Enough for several weeks of Penn departures. */
const MAX_EVENTS = 5_000;
/** How long an instance reuses the table before re-reading it. */
const TABLE_TTL_MS = 5 * 60_000;

/**
 * Records one pairing at most once per train per day across every instance and
 * caller, so a train standing on its platform through many refreshes and
 * scheduled recordings counts once.
 */
const RECORD_ONCE =
  "if redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[2]) then " +
  "redis.call('HINCRBY', KEYS[1], ARGV[1], 1) " +
  "redis.call('LPUSH', KEYS[3], ARGV[3]) " +
  "redis.call('LTRIM', KEYS[3], 0, ARGV[4]) " +
  "return 1 else return 0 end";

let cachedTable: { at: number; table: CircuitTable } | null = null;
/** Pairs this instance has already sent, so Redis sees each one once. */
const sent = new Set<string>();
const SENT_LIMIT = 5_000;

function fixtureEvents(): PositionEvent[] {
  return fixturePositionHistory().map((observation) => ({
    ...observation,
    recordedAt: new Date(Date.parse(observation.scheduledTime) - 8 * 60_000).toISOString(),
  }));
}

function tableFromEvents(events: CircuitObservation[]): CircuitTable {
  const table: CircuitTable = new Map();
  for (const { circuit, track } of events) addToTable(table, circuit, track);
  return table;
}

/** The pair counts the board consults, briefly cached per instance. */
export async function loadCircuitTable(): Promise<CircuitTable> {
  if (usingFixtures()) return tableFromEvents(fixturePositionHistory());

  const now = Date.now();
  if (cachedTable && now - cachedTable.at < TABLE_TTL_MS) return cachedTable.table;
  const table = parseCircuitTable(await redisCommand<string[]>("HGETALL", TABLE_KEY));
  cachedTable = { at: now, table };
  return table;
}

/** Stores new pairings; returns how many were new to the history. */
export async function recordObservations(
  observations: CircuitObservation[],
): Promise<number> {
  if (usingFixtures() || observations.length === 0) return 0;
  if (sent.size > SENT_LIMIT) sent.clear();

  let recorded = 0;
  for (const observation of observations) {
    const { trainNumber, circuit, track } = observation;
    const key = `${trainNumber}|${circuit}|${track}`;
    if (sent.has(key)) continue;

    const event: PositionEvent = { ...observation, recordedAt: new Date().toISOString() };
    const added = await redisCommand<number>(
      "EVAL",
      RECORD_ONCE,
      3,
      TABLE_KEY,
      `${SEEN_KEY_PREFIX}${key}`,
      EVENTS_KEY,
      circuitField(circuit, track),
      SEEN_TTL_SECONDS,
      JSON.stringify(event),
      MAX_EVENTS - 1,
    );
    sent.add(key);
    if (added) {
      recorded += 1;
      if (cachedTable) addToTable(cachedTable.table, circuit, track);
    }
  }
  return recorded;
}

function isPositionEvent(value: unknown): value is PositionEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return ["trainNumber", "circuit", "track", "scheduledTime", "recordedAt"].every(
    (field) => typeof event[field] === "string",
  );
}

/** The full history, uncached: pair counts plus individual pairings, newest first. */
export async function loadPositionHistory(): Promise<{
  table: CircuitTable;
  events: PositionEvent[];
}> {
  if (usingFixtures()) {
    const events = fixtureEvents();
    return { table: tableFromEvents(events), events };
  }

  const [flat, rawEvents] = await Promise.all([
    redisCommand<string[]>("HGETALL", TABLE_KEY),
    redisCommand<string[]>("LRANGE", EVENTS_KEY, 0, -1),
  ]);
  const events: PositionEvent[] = [];
  for (const raw of rawEvents ?? []) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isPositionEvent(parsed)) events.push(parsed);
    } catch {
      // A malformed entry is skipped rather than failing the whole page.
    }
  }
  return { table: parseCircuitTable(flat), events };
}
