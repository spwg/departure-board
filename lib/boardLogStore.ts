import "server-only";
import {
  BOARD_LOG_VERSION,
  changeEvent,
  changeKey,
  firstEvent,
  logDay,
  logMinute,
  type BoardLogEvent,
  type BoardLogSource,
  type TrainSnapshot,
} from "./boardLog";
import { usingFixtures } from "./njtClient";
import { redisCommand } from "./njtTokenStore";

/**
 * The New York Penn board log in Upstash Redis, per Eastern day:
 *
 *  - a list of JSON entries in the order they were logged,
 *  - a hash counting board loads per minute of the day, so gaps show,
 *
 * plus a hash of each train's last logged state so only changes are written.
 * Every day's keys expire after 90 days. See lib/boardLog.
 */

export const BOARD_LOG_PREFIX = "departure-board:penn-board-log:v1:";
const STATE_KEY = `${BOARD_LOG_PREFIX}state`;
/** Long enough to tune against a season of service, small enough for Upstash's free tier. */
export const RETENTION_SECONDS = 90 * 24 * 60 * 60;
/** Forget the last states after a long outage, so a restart logs every train afresh. */
const STATE_TTL_SECONDS = 6 * 60 * 60;
/** Train ids are spliced into "gone" entries in Lua, so they must need no escaping. */
const SAFE_ID = /^[\w .:+|-]+$/;

/**
 * Atomically: per train, log its full entry if it is new or its change entry
 * if what riders see differs from the last logged; log every previously seen
 * train that has left the board as gone; and count the load. Returns how many
 * train entries were written.
 *
 * KEYS: state, day list, day poll counts.
 * ARGV: retention, state TTL, poll field, gone prefix, train count, then per
 * train its id, change key, first entry and change entry.
 */
const LOG_BOARD = `
local state, day, polls = KEYS[1], KEYS[2], KEYS[3]
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
redis.call('HINCRBY', polls, ARGV[3], 1)
redis.call('EXPIRE', day, ARGV[1])
redis.call('EXPIRE', polls, ARGV[1])
redis.call('EXPIRE', state, ARGV[2])
return logged
`;

/** Logs one fresh board load; returns how many train entries were written. */
export async function logBoard(
  snapshots: TrainSnapshot[],
  options: { source: BoardLogSource; vehicles: boolean; history: boolean; at?: string },
): Promise<number> {
  if (usingFixtures()) return 0;
  const at = options.at ?? new Date().toISOString();
  const { source } = options;
  const safe = snapshots.filter((snapshot) => SAFE_ID.test(snapshot.id));
  const day = logDay(at);
  // A load missing the vehicle feed or the history can predict nothing, so it
  // is counted apart from a healthy one.
  const health = options.vehicles ? (options.history ? "ok" : "no-history") : "no-vehicles";
  const gonePrefix = JSON.stringify({ kind: "gone", v: BOARD_LOG_VERSION, at, source }).slice(0, -1) + ',"id":';

  return redisCommand<number>(
    "EVAL",
    LOG_BOARD,
    3,
    STATE_KEY,
    `${BOARD_LOG_PREFIX}${day}`,
    `${BOARD_LOG_PREFIX}polls:${day}`,
    RETENTION_SECONDS,
    STATE_TTL_SECONDS,
    `${logMinute(at)}:${source}:${health}`,
    gonePrefix,
    safe.length,
    ...safe.flatMap((snapshot) => [
      snapshot.id,
      changeKey(snapshot),
      JSON.stringify(firstEvent(at, source, snapshot)),
      JSON.stringify(changeEvent(at, source, snapshot)),
    ]),
  );
}

/** One Eastern day's entries, oldest first, and its board loads per minute. */
export async function loadBoardLog(day: string): Promise<{
  events: BoardLogEvent[];
  polls: Record<string, number>;
}> {
  const [raw, flat] = await Promise.all([
    redisCommand<string[]>("LRANGE", `${BOARD_LOG_PREFIX}${day}`, 0, -1),
    redisCommand<string[]>("HGETALL", `${BOARD_LOG_PREFIX}polls:${day}`),
  ]);
  const events: BoardLogEvent[] = [];
  for (const entry of raw ?? []) {
    try {
      events.push(JSON.parse(entry) as BoardLogEvent);
    } catch {
      // A malformed entry is skipped rather than losing the day.
    }
  }
  const polls: Record<string, number> = {};
  for (let i = 0; i + 1 < (flat ?? []).length; i += 2) polls[flat[i]] = Number(flat[i + 1]);
  return { events, polls };
}
