import {
  BOARD_LOG_VERSION,
  changeEvent,
  changeKey,
  firstEvent,
  logDay,
  logMinute,
  type BoardLogEvent,
  type TrainSnapshot,
} from "./boardLog";
import type { TrainPosition } from "./departures";
import {
  circuitField,
  parseCircuitTable,
  type CircuitObservation,
  type CircuitTable,
} from "./trainPositions";

/**
 * New York Penn's data in Upstash Redis, free of any framework so the
 * collector Worker (the only writer) and the Next.js app (a reader) share it:
 *
 *  - position history: circuit/track pair counts over the last 90 days, plus
 *    each Eastern day's counts so that day can be taken back out once it is 90
 *    days old;
 *  - the board log: per Eastern day, a list of what the board showed each
 *    train and a hash counting collections per minute (lib/boardLog);
 *  - the current predictions, which the app reads to show predicted tracks.
 *
 * Every write is one Lua script per collection, to stay well inside Upstash's
 * free command allowance.
 */

export type RedisCommand = <T>(...command: Array<string | number>) => Promise<T>;

const HISTORY_KEY = "departure-board:penn-circuits:v2";
const HISTORY_DAY_PREFIX = "departure-board:penn-circuits:v2:day:";
const SEEN_PREFIX = "departure-board:penn-circuits-seen:v2:";
const AGED_PREFIX = "departure-board:penn-circuits:v2:aged:";
export const BOARD_LOG_PREFIX = "departure-board:penn-board-log:v1:";
const BOARD_STATE_KEY = `${BOARD_LOG_PREFIX}state`;
export const PREDICTIONS_KEY = "departure-board:penn-predictions:v1";

export const HISTORY_DAYS = 90;
/**
 * A day's counts outlive the window by this much, so an outage of up to this
 * long still finds them to take out; the ageing looks back as far.
 */
const AGE_OUT_GRACE_DAYS = 30;
const DAY_SECONDS = 24 * 60 * 60;
const HISTORY_DAY_TTL = (HISTORY_DAYS + AGE_OUT_GRACE_DAYS) * DAY_SECONDS;
/** A train number recurs daily; record its pairing again on a later day. */
const SEEN_TTL = 12 * 60 * 60;
/** Long enough to tune against a season of service, small enough for Upstash's free tier. */
export const LOG_RETENTION = HISTORY_DAYS * DAY_SECONDS;
/** Forget the last states after a long outage, so a restart logs every train afresh. */
const BOARD_STATE_TTL = 6 * 60 * 60;
/**
 * Predictions outlive a missed collection or two, then vanish: a stalled
 * collector must not leave stale predicted tracks on the board.
 */
export const PREDICTIONS_TTL = 3 * 60;
/** Train ids are spliced into "gone" entries in Lua, so they must need no escaping. */
const SAFE_ID = /^[\w .:+|-]+$/;

/**
 * Records each new pairing once per train per day; once a day, takes days past
 * the 90-day window back out of the running counts; returns the pairings newly
 * recorded and the running counts.
 *
 * KEYS: counts, today's counts, today's ageing marker, one "seen" key per
 * pairing, then the day hashes past the window.
 * ARGV: pairing count, seen TTL, day TTL, marker TTL, then each pairing's field.
 */
const RECORD_HISTORY = `
local n = tonumber(ARGV[1])
local recorded = 0
for i = 1, n do
  if redis.call('SET', KEYS[3 + i], '1', 'NX', 'EX', ARGV[2]) then
    redis.call('HINCRBY', KEYS[1], ARGV[4 + i], 1)
    redis.call('HINCRBY', KEYS[2], ARGV[4 + i], 1)
    recorded = recorded + 1
  end
end
if recorded > 0 then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
if redis.call('SET', KEYS[3], '1', 'NX', 'EX', ARGV[4]) then
  for i = 4 + n, #KEYS do
    local day = redis.call('HGETALL', KEYS[i])
    for j = 1, #day, 2 do
      if redis.call('HINCRBY', KEYS[1], day[j], -tonumber(day[j + 1])) <= 0 then
        redis.call('HDEL', KEYS[1], day[j])
      end
    end
    redis.call('DEL', KEYS[i])
  end
end
return {recorded, redis.call('HGETALL', KEYS[1])}
`;

/** The day hashes past the window that may still need taking out. */
export function agedDayKeys(now: number): string[] {
  const keys: string[] = [];
  for (let age = HISTORY_DAYS; age < HISTORY_DAYS + AGE_OUT_GRACE_DAYS; age += 1) {
    keys.push(`${HISTORY_DAY_PREFIX}${logDay(new Date(now - age * DAY_SECONDS * 1000).toISOString())}`);
  }
  return keys;
}

/** Records new pairings and returns the history the board predicts from. */
export async function recordHistory(
  redis: RedisCommand,
  observations: CircuitObservation[],
  now: number,
): Promise<{ recorded: number; table: CircuitTable }> {
  const today = logDay(new Date(now).toISOString());
  const [recorded, flat] = await redis<[number, string[]]>(
    "EVAL",
    RECORD_HISTORY,
    3 + observations.length + AGE_OUT_GRACE_DAYS,
    HISTORY_KEY,
    `${HISTORY_DAY_PREFIX}${today}`,
    `${AGED_PREFIX}${today}`,
    ...observations.map(({ trainNumber, circuit, track }) => `${SEEN_PREFIX}${trainNumber}|${circuit}|${track}`),
    ...agedDayKeys(now),
    observations.length,
    SEEN_TTL,
    HISTORY_DAY_TTL,
    2 * DAY_SECONDS,
    ...observations.map(({ circuit, track }) => circuitField(circuit, track)),
  );
  return { recorded, table: parseCircuitTable(flat) };
}

/**
 * Atomically: per train, log its full entry if it is new or its change entry
 * if what riders see differs from the last logged; log every previously seen
 * train that has left the board as gone; count the collection; and publish the
 * current predictions. Returns how many train entries were written.
 *
 * KEYS: state, day list, day counts, predictions.
 * ARGV: retention, state TTL, count field, gone prefix, train count, per train
 * its id, change key, first entry and change entry, then the predictions and
 * their TTL.
 */
const LOG_BOARD = `
local state, day, counts = KEYS[1], KEYS[2], KEYS[3]
local count = tonumber(ARGV[5])
local current = {}
local logged = 0
for i = 0, count - 1 do
  local base = 6 + i * 4
  local id, key = ARGV[base], ARGV[base + 1]
  current[id] = true
  local last = redis.call('HGET', state, id)
  if last ~= key then
    redis.call('HSET', state, id, key)
    redis.call('RPUSH', day, last and ARGV[base + 3] or ARGV[base + 2])
    logged = logged + 1
  end
end
for _, id in ipairs(redis.call('HKEYS', state)) do
  if not current[id] then
    redis.call('HDEL', state, id)
    redis.call('RPUSH', day, ARGV[4] .. '"' .. id .. '"}')
    logged = logged + 1
  end
end
redis.call('HINCRBY', counts, ARGV[3], 1)
redis.call('EXPIRE', day, ARGV[1])
redis.call('EXPIRE', counts, ARGV[1])
redis.call('EXPIRE', state, ARGV[2])
local tail = 6 + count * 4
redis.call('SET', KEYS[4], ARGV[tail], 'EX', ARGV[tail + 1])
return logged
`;

/** What the app reads to show predicted tracks: positions by train id. */
export type PredictionSnapshot = {
  v: number;
  at: string;
  predictions: Record<string, TrainPosition>;
};

/** Logs one collection and publishes its predictions. */
export async function logBoard(
  redis: RedisCommand,
  snapshots: TrainSnapshot[],
  predictions: PredictionSnapshot,
  health: { vehicles: boolean; history: boolean },
): Promise<number> {
  const { at } = predictions;
  const source = "collector";
  const safe = snapshots.filter((snapshot) => SAFE_ID.test(snapshot.id));
  const day = logDay(at);
  // A collection missing the vehicle feed or the history can predict nothing,
  // so it is counted apart from a healthy one.
  const status = health.vehicles ? (health.history ? "ok" : "no-history") : "no-vehicles";
  const gonePrefix = JSON.stringify({ kind: "gone", v: BOARD_LOG_VERSION, at, source }).slice(0, -1) + ',"id":';

  return redis<number>(
    "EVAL",
    LOG_BOARD,
    4,
    BOARD_STATE_KEY,
    `${BOARD_LOG_PREFIX}${day}`,
    `${BOARD_LOG_PREFIX}polls:${day}`,
    PREDICTIONS_KEY,
    LOG_RETENTION,
    BOARD_STATE_TTL,
    `${logMinute(at)}:${source}:${status}`,
    gonePrefix,
    safe.length,
    ...safe.flatMap((snapshot) => [
      snapshot.id,
      changeKey(snapshot),
      JSON.stringify(firstEvent(at, source, snapshot)),
      JSON.stringify(changeEvent(at, source, snapshot)),
    ]),
    JSON.stringify(predictions),
    PREDICTIONS_TTL,
  );
}

/** The latest published predictions, or null when none are current. */
export async function loadPredictions(redis: RedisCommand): Promise<PredictionSnapshot | null> {
  const raw = await redis<string | null>("GET", PREDICTIONS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PredictionSnapshot;
    return parsed && typeof parsed.at === "string" && parsed.predictions ? parsed : null;
  } catch {
    return null;
  }
}

export type { BoardLogEvent };
