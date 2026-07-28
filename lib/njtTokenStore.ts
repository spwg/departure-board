const REDIS_TOKEN_KEY = "departure-board:njt-token:v1";
const REDIS_LOCK_KEY = "departure-board:njt-token-lock:v1";
export const TOKEN_LOCK_SECONDS = 30;
const TOKEN_WAIT_MS = 250;
const TOKEN_WAIT_TIMEOUT_MS = 12_000;
const REDIS_TIMEOUT_MS = 5_000;

function redisCredentials(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set " +
        "when NJ Transit credentials are configured",
    );
  }
  return { url, token };
}

type RedisResult<T> = { result?: T; error?: string };
type RedisCommand = <T>(...command: Array<string | number>) => Promise<T>;

export interface TokenStoreRedis {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  tryAcquireTokenLock(): Promise<boolean>;
  deleteTokenIfEqual(token: string): Promise<void>;
}

export interface TokenStoreOptions {
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
  waitMilliseconds?: number;
  waitTimeoutMilliseconds?: number;
}

/** Executes one Redis command through Upstash's HTTPS API. */
async function redisCommand<T>(...command: Array<string | number>): Promise<T> {
  const { url, token } = redisCredentials();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => null)) as RedisResult<T> | null;
  if (!response.ok || !payload || payload.error || !("result" in payload)) {
    throw new Error(
      `Upstash Redis command failed: ${response.status}` +
        (payload?.error ? ` ${payload.error}` : ""),
    );
  }
  return payload.result as T;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Connects the token store's small interface to Upstash's REST command API. */
export function createUpstashTokenStore(
  command: RedisCommand = redisCommand,
): TokenStoreRedis {
  return {
    async getToken() {
      return command<string | null>("GET", REDIS_TOKEN_KEY);
    },
    async setToken(token) {
      await command<"OK">("SET", REDIS_TOKEN_KEY, token);
    },
    async tryAcquireTokenLock() {
      const lock = await command<"OK" | null>(
        "SET",
        REDIS_LOCK_KEY,
        crypto.randomUUID(),
        "NX",
        "EX",
        TOKEN_LOCK_SECONDS,
      );
      return lock === "OK";
    },
    async deleteTokenIfEqual(token) {
      const compareAndDelete =
        'if redis.call("get", KEYS[1]) == ARGV[1] then ' +
        'return redis.call("del", KEYS[1]) else return 0 end';
      await command<number>(
        "EVAL",
        compareAndDelete,
        1,
        REDIS_TOKEN_KEY,
        token,
      );
    },
  };
}

/**
 * Returns the shared token, minting it only while holding Redis's atomic lock.
 *
 * SET NX lets exactly one Vercel instance become the writer. Contenders poll
 * for that writer's result rather than minting their own token.
 */
export function createTokenStore(
  redis: TokenStoreRedis,
  {
    now = Date.now,
    wait: waitFor = wait,
    waitMilliseconds = TOKEN_WAIT_MS,
    waitTimeoutMilliseconds = TOKEN_WAIT_TIMEOUT_MS,
  }: TokenStoreOptions = {},
) {
  async function getOrCreateStoredToken(
    mintToken: () => Promise<string>,
  ): Promise<string> {
    const deadline = now() + waitTimeoutMilliseconds;

    while (now() < deadline) {
      const stored = await redis.getToken();
      if (stored) return stored;

      if (await redis.tryAcquireTokenLock()) {
        const token = await mintToken();
        await redis.setToken(token);
        return token;
      }

      await waitFor(waitMilliseconds);
    }

    throw new Error("Timed out waiting for another request to cache the NJT token");
  }

  async function invalidateStoredToken(rejectedToken: string): Promise<void> {
    await redis.deleteTokenIfEqual(rejectedToken);
  }

  return { getOrCreateStoredToken, invalidateStoredToken };
}

const tokenStore = createTokenStore(createUpstashTokenStore());

export const getOrCreateStoredToken = tokenStore.getOrCreateStoredToken;

/** Deletes a rejected token only if Redis still contains that exact value. */
export async function invalidateStoredToken(
  rejectedToken: string,
): Promise<void> {
  await tokenStore.invalidateStoredToken(rejectedToken);
}
