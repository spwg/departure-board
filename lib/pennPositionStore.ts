import "server-only";
import { logDay } from "./boardLog";
import { fixturePositionHistory } from "./fixtures";
import { usingFixtures } from "./njtClient";
import { redisCommand } from "./njtTokenStore";
import {
  addToTable,
  circuitField,
  parseCircuitTable,
  type CircuitObservation,
  type CircuitTable,
} from "./trainPositions";

/**
 * New York Penn position history in Upstash Redis, the same database that holds
 * the NJT token:
 *
 *  - a hash of circuit/track pair counts over the last 90 days, which is what
 *    the board consults,
 *  - a hash of each Eastern day's pair counts, kept so that day can be taken
 *    back out of the running counts once it is 90 days old.
 *
 * Ageing out keeps a circuit renamed or remapped during track work from
 * predicting its old track forever. Fixture runs have no Redis and read a
 * canned history instead.
 */

const TABLE_KEY = "departure-board:penn-circuits:v2";
const DAY_KEY_PREFIX = "departure-board:penn-circuits:v2:day:";
const SEEN_KEY_PREFIX = "departure-board:penn-circuits-seen:v2:";
/** A train number recurs daily; record its pairing again on a later day. */
const SEEN_TTL_SECONDS = 12 * 60 * 60;
export const HISTORY_DAYS = 90;
/**
 * A day's counts outlive the window by this much, so an outage of up to this
 * long still finds them to take out; the ageing check looks back as far.
 */
const AGE_OUT_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;
const RETENTION_SECONDS = (HISTORY_DAYS + AGE_OUT_GRACE_DAYS) * 24 * 60 * 60;
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
  "redis.call('HINCRBY', KEYS[3], ARGV[1], 1) " +
  "redis.call('EXPIRE', KEYS[3], ARGV[3]) " +
  "return 1 else return 0 end";

/**
 * Takes each given day's counts back out of the running counts, once: the
 * day's hash is deleted as it is subtracted, so a repeat finds nothing. KEYS:
 * the running counts, then the days' hashes. Returns the days taken out.
 */
const AGE_OUT =
  "local aged = 0 " +
  "for i = 2, #KEYS do " +
  "  local day = redis.call('HGETALL', KEYS[i]) " +
  "  for j = 1, #day, 2 do " +
  "    if redis.call('HINCRBY', KEYS[1], day[j], -tonumber(day[j + 1])) <= 0 then " +
  "      redis.call('HDEL', KEYS[1], day[j]) " +
  "    end " +
  "  end " +
  "  if #day > 0 then aged = aged + 1 end " +
  "  redis.call('DEL', KEYS[i]) " +
  "end " +
  "return aged";

/** The day hashes past the window that may still need taking out. */
export function agedDayKeys(now: number): string[] {
  const keys: string[] = [];
  for (let age = HISTORY_DAYS; age < HISTORY_DAYS + AGE_OUT_GRACE_DAYS; age += 1) {
    keys.push(`${DAY_KEY_PREFIX}${logDay(new Date(now - age * DAY_MS).toISOString())}`);
  }
  return keys;
}

let cachedTable: { at: number; table: CircuitTable } | null = null;
/** Pairs this instance has already sent, so Redis sees each one once. */
const sent = new Set<string>();
const SENT_LIMIT = 5_000;

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
  await redisCommand<number>("EVAL", AGE_OUT, 1 + AGE_OUT_GRACE_DAYS, TABLE_KEY, ...agedDayKeys(now));
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

    const added = await redisCommand<number>(
      "EVAL",
      RECORD_ONCE,
      3,
      TABLE_KEY,
      `${SEEN_KEY_PREFIX}${key}`,
      `${DAY_KEY_PREFIX}${logDay(new Date().toISOString())}`,
      circuitField(circuit, track),
      SEEN_TTL_SECONDS,
      RETENTION_SECONDS,
    );
    sent.add(key);
    if (added) {
      recorded += 1;
      if (cachedTable) addToTable(cachedTable.table, circuit, track);
    }
  }
  return recorded;
}
