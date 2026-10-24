import { logDay, type BoardLogEvent } from "./boardLog";
import type { TrainPosition } from "./departures";

/**
 * New York Penn's data in Upstash Redis, free of any framework so the
 * collector Worker (the only writer) and the Next.js app (a reader) share it:
 *
 *  - position history: circuit/track pair counts over the last 90 days, plus
 *    each Eastern day's counts so that day can be taken back out once it is 90
 *    days old;
 *  - the board log: per Eastern day, a list of what the board showed each
 *    train and a hash counting collections per minute (lib/boardLog);
 *  - the current predictions, which the app reads to show predicted tracks;
 *  - the collector's own state between runs: what it last logged for each
 *    train, the pairings it has already recorded for it, and a copy of the
 *    history counts.
 *
 * Upstash bills every command a Lua script runs, not just the script, and the
 * free plan allows 500K a month. A collection therefore reads its state in one
 * GET and writes everything in one script whose commands do not grow with the
 * number of trains: about 7 commands a minute, 300K a month.
 */

export type RedisCommand = <T>(...command: Array<string | number>) => Promise<T>;

const HISTORY_KEY = "departure-board:penn-circuits:v2";
const HISTORY_DAY_PREFIX = "departure-board:penn-circuits:v2:day:";
export const BOARD_LOG_PREFIX = "departure-board:penn-board-log:v1:";
export const PREDICTIONS_KEY = "departure-board:penn-predictions:v1";
export const COLLECTOR_STATE_KEY = "departure-board:penn-collector-state:v1";

export const HISTORY_DAYS = 90;
/**
 * A day's counts outlive the window by this much, so an outage of up to this
 * long still finds them to take out; the ageing looks back as far.
 */
const AGE_OUT_GRACE_DAYS = 30;
const DAY_SECONDS = 24 * 60 * 60;
const HISTORY_DAY_TTL = (HISTORY_DAYS + AGE_OUT_GRACE_DAYS) * DAY_SECONDS;
/** Long enough to tune against a season of service, small enough for Upstash's free tier. */
export const LOG_RETENTION = HISTORY_DAYS * DAY_SECONDS;
/** Forget the state after a long outage, so a restart logs every train afresh. */
const COLLECTOR_STATE_TTL = 6 * 60 * 60;
/**
 * Predictions outlive a missed collection or two, then vanish: a stalled
 * collector must not leave stale predicted tracks on the board.
 */
export const PREDICTIONS_TTL = 3 * 60;

/** What the collector remembers between runs. */
export type CollectorState = {
  v: 1;
  /** Per train id on the board: its last logged change key, hashed. */
  trains: Record<string, { key: number }>;
  /**
   * Pairings already recorded, as "train number|circuit|track", with when
   * each may be recorded again. Kept apart from `trains` so a train that
   * briefly leaves the board (a full-screen station alert empties it) is not
   * counted twice when it returns.
   */
  seen: Record<string, number>;
  /** The running history counts as HGETALL returns them, as of the last collection. */
  table: string[] | null;
  /** The Eastern day `table` was last aged and reloaded on. */
  tableDay: string | null;
  /** The Eastern day whose poll counts were last given their expiry. */
  pollsDay: string | null;
  /** The Eastern day whose history counts were last given their expiry. */
  pairingsDay: string | null;
};

export function emptyCollectorState(): CollectorState {
  return { v: 1, trains: {}, seen: {}, table: null, tableDay: null, pollsDay: null, pairingsDay: null };
}

/** The collector's state from its last run, or a fresh one when none is current. */
export async function loadCollectorState(redis: RedisCommand): Promise<CollectorState> {
  const raw = await redis<string | null>("GET", COLLECTOR_STATE_KEY);
  if (!raw) return emptyCollectorState();
  try {
    const parsed = JSON.parse(raw) as CollectorState;
    return parsed?.v === 1 && parsed.trains && typeof parsed.trains === "object"
      ? { ...parsed, seen: parsed.seen && typeof parsed.seen === "object" ? parsed.seen : {} }
      : emptyCollectorState();
  } catch {
    return emptyCollectorState();
  }
}

/**
 * Takes the days past the 90-day window back out of the running counts, then
 * returns the counts. Run once a day: a day already taken out is deleted, so
 * running it again changes nothing.
 *
 * KEYS: counts, then the day hashes past the window.
 */
const AGE_HISTORY = `
for i = 2, #KEYS do
  local day = redis.call('HGETALL', KEYS[i])
  if #day > 0 then
    for j = 1, #day, 2 do
      if redis.call('HINCRBY', KEYS[1], day[j], -tonumber(day[j + 1])) <= 0 then
        redis.call('HDEL', KEYS[1], day[j])
      end
    end
    redis.call('DEL', KEYS[i])
  end
end
return redis.call('HGETALL', KEYS[1])
`;

/** The day hashes past the window that may still need taking out. */
export function agedDayKeys(now: number): string[] {
  const keys: string[] = [];
  for (let age = HISTORY_DAYS; age < HISTORY_DAYS + AGE_OUT_GRACE_DAYS; age += 1) {
    keys.push(`${HISTORY_DAY_PREFIX}${logDay(new Date(now - age * DAY_SECONDS * 1000).toISOString())}`);
  }
  return keys;
}

/** Ages the history out of its 90-day window and returns the counts, flat. */
export async function ageHistory(redis: RedisCommand, now: number): Promise<string[]> {
  return redis<string[]>("EVAL", AGE_HISTORY, 1 + AGE_OUT_GRACE_DAYS, HISTORY_KEY, ...agedDayKeys(now));
}

/**
 * Writes one collection atomically: counts each newly recorded pairing in the
 * running and today's history, appends the board log entries, counts the
 * collection, and saves the collector's state and the current predictions.
 * Expiries are set only when a key is new for the day, never every minute.
 *
 * KEYS: counts, today's counts, today's log, today's poll counts, state,
 * predictions.
 * ARGV: day TTL, log retention, poll field, whether to set the poll counts'
 * expiry, whether to set today's counts' expiry, state, state TTL,
 * predictions, predictions TTL, pairing count, the pairings' fields, then the
 * log entries.
 */
const SAVE_COLLECTION = `
local pairings = tonumber(ARGV[10])
for i = 11, 10 + pairings do
  redis.call('HINCRBY', KEYS[1], ARGV[i], 1)
  redis.call('HINCRBY', KEYS[2], ARGV[i], 1)
end
if ARGV[5] == '1' then redis.call('EXPIRE', KEYS[2], ARGV[1]) end
local entries = #ARGV - 10 - pairings
if entries > 0 then
  if redis.call('RPUSH', KEYS[3], unpack(ARGV, 11 + pairings)) == entries then
    redis.call('EXPIRE', KEYS[3], ARGV[2])
  end
end
redis.call('HINCRBY', KEYS[4], ARGV[3], 1)
if ARGV[4] == '1' then redis.call('EXPIRE', KEYS[4], ARGV[2]) end
redis.call('SET', KEYS[5], ARGV[6], 'EX', ARGV[7])
redis.call('SET', KEYS[6], ARGV[8], 'EX', ARGV[9])
return entries
`;

/** What the app reads to show predicted tracks: positions by train id. */
export type PredictionSnapshot = {
  v: number;
  at: string;
  predictions: Record<string, TrainPosition>;
};

export type Collection = {
  predictions: PredictionSnapshot;
  /** Hash fields of the pairings recorded for the first time in this collection. */
  pairings: string[];
  /** Board log entries, already serialized. */
  entries: string[];
  /** The poll field this collection is counted under. */
  pollField: string;
  setPollsExpiry: boolean;
  setPairingsExpiry: boolean;
  state: CollectorState;
};

/** Saves one collection and returns how many log entries it wrote. */
export async function saveCollection(redis: RedisCommand, collection: Collection): Promise<number> {
  const day = logDay(collection.predictions.at);
  return redis<number>(
    "EVAL",
    SAVE_COLLECTION,
    6,
    HISTORY_KEY,
    `${HISTORY_DAY_PREFIX}${day}`,
    `${BOARD_LOG_PREFIX}${day}`,
    `${BOARD_LOG_PREFIX}polls:${day}`,
    COLLECTOR_STATE_KEY,
    PREDICTIONS_KEY,
    HISTORY_DAY_TTL,
    LOG_RETENTION,
    collection.pollField,
    collection.setPollsExpiry ? 1 : 0,
    collection.setPairingsExpiry ? 1 : 0,
    JSON.stringify(collection.state),
    COLLECTOR_STATE_TTL,
    JSON.stringify(collection.predictions),
    PREDICTIONS_TTL,
    collection.pairings.length,
    ...collection.pairings,
    ...collection.entries,
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
