import { NjtAuthError } from "./njtApi";
import { njtEnvironment, type NjtEnvironment } from "./njtEnvironment";

export const TOKEN_LOCK_SECONDS = 30;
const TOKEN_WAIT_MS = 1_000;
const TOKEN_WAIT_TIMEOUT_MS = 10_000;
const REDIS_TIMEOUT_MS = 5_000;

/**
 * How long nobody tries getToken again after an attempt fails. NJ Transit
 * refusing outright (the daily limit, or bad credentials) will not change for
 * a while, and each further attempt could spend one of the day's 10; a network
 * failure or timeout is worth trying again sooner.
 */
export const REFUSED_MINT_COOLDOWN_MS = 60 * 60_000;
export const FAILED_MINT_COOLDOWN_MS = 2 * 60_000;

export function mintCooldownMs(error: unknown): number {
  return error instanceof NjtAuthError ? REFUSED_MINT_COOLDOWN_MS : FAILED_MINT_COOLDOWN_MS;
}

/** Upstash could not be reached or refused the command (its monthly limit, say). */
export class RedisUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RedisUnavailableError";
  }
}

/** A recent getToken attempt failed, so no one tries again until `retryAt`. */
export class TokenCooldownError extends Error {
  constructor(readonly retryAt: number) {
    super(`NJT token minting is cooling down until ${new Date(retryAt).toISOString()} after a failed attempt`);
    this.name = "TokenCooldownError";
  }
}

function redisCredentials(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new RedisUnavailableError(
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
  /** When minting may be tried again, or null when it may be tried now. */
  getMintCooldown(): Promise<number | null>;
  setMintCooldown(retryAt: number): Promise<void>;
}

export interface TokenStoreOptions {
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
  waitMilliseconds?: number;
  waitTimeoutMilliseconds?: number;
}

/**
 * Executes one Redis command through Upstash's HTTPS API. Every failure —
 * unreachable, timed out, or refused — throws RedisUnavailableError, so
 * callers can carry on without Redis where they are able to.
 */
export async function redisCommand<T>(...command: Array<string | number>): Promise<T> {
  const { url, token } = redisCredentials();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
  } catch (error) {
    throw new RedisUnavailableError(`Upstash Redis unreachable: ${String(error)}`, { cause: error });
  }

  const payload = (await response.json().catch(() => null)) as RedisResult<T> | null;
  if (!response.ok || !payload || payload.error || !("result" in payload)) {
    throw new RedisUnavailableError(
      `Upstash Redis command failed: ${response.status}` +
        (payload?.error ? ` ${payload.error}` : ""),
    );
  }
  return payload.result as T;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type TokenKeys = Pick<NjtEnvironment, "tokenKey" | "lockKey" | "cooldownKey">;

/**
 * Connects the token store's small interface to Upstash's REST command API,
 * under NJT_ENV's keys (lib/njtEnvironment) so each backend keeps its own
 * token. The keys are read per command, so merely importing this never
 * requires NJT_ENV.
 */
export function createUpstashTokenStore(
  command: RedisCommand = redisCommand,
  keys: () => TokenKeys = () => njtEnvironment(),
): TokenStoreRedis {
  return {
    async getToken() {
      return command<string | null>("GET", keys().tokenKey);
    },
    async setToken(token) {
      await command<"OK">("SET", keys().tokenKey, token);
    },
    async tryAcquireTokenLock() {
      const lock = await command<"OK" | null>(
        "SET",
        keys().lockKey,
        crypto.randomUUID(),
        "NX",
        "EX",
        TOKEN_LOCK_SECONDS,
      );
      return lock === "OK";
    },
    async getMintCooldown() {
      const retryAt = Number(await command<string | null>("GET", keys().cooldownKey));
      return retryAt > Date.now() ? retryAt : null;
    },
    async setMintCooldown(retryAt) {
      const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
      await command<"OK">("SET", keys().cooldownKey, retryAt, "EX", seconds);
    },
    async deleteTokenIfEqual(token) {
      const compareAndDelete =
        'if redis.call("get", KEYS[1]) == ARGV[1] then ' +
        'return redis.call("del", KEYS[1]) else return 0 end';
      await command<number>(
        "EVAL",
        compareAndDelete,
        1,
        keys().tokenKey,
        token,
      );
    },
  };
}

/**
 * Returns the shared token, minting it only while holding Redis's atomic lock.
 *
 * SET NX lets exactly one Vercel instance become the writer. Contenders poll
 * for that writer's result rather than minting their own token. A failed mint
 * starts a cooldown (mintCooldownMs) during which every caller fails fast with
 * TokenCooldownError instead of trying getToken again. The failed writer keeps
 * the lock until it expires: a contender that read "no cooldown" just before
 * the failure then cannot take the lock and mint, and on its next poll finds
 * the cooldown, which always outlasts the lock.
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

      const retryAt = await redis.getMintCooldown();
      if (retryAt !== null) throw new TokenCooldownError(retryAt);

      if (await redis.tryAcquireTokenLock()) {
        let token: string;
        try {
          token = await mintToken();
        } catch (error) {
          // Best-effort: the mint's own error is the one worth reporting.
          await redis.setMintCooldown(now() + mintCooldownMs(error)).catch(() => {});
          throw error;
        }
        // The token is good even if storing it fails; minting it again would
        // spend another of the day's 10.
        await redis.setToken(token).catch((error: unknown) => {
          console.error("Could not store the NJT token:", error);
        });
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
