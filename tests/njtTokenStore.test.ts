import assert from "node:assert/strict";
import test from "node:test";
import { NjtAuthError } from "../lib/njtApi";
import { njtEnvironment } from "../lib/njtEnvironment";
import {
  createTokenStore,
  createUpstashTokenStore,
  FAILED_MINT_COOLDOWN_MS,
  REFUSED_MINT_COOLDOWN_MS,
  TOKEN_LOCK_SECONDS,
  TokenCooldownError,
  type TokenStoreRedis,
} from "../lib/njtTokenStore";

/** The parts of the store a test does not care about. */
const idle = {
  async getMintCooldown() {
    return null;
  },
  async setMintCooldown() {},
};

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("a contender waits for the writer to store its token", { timeout: 1_000 }, async () => {
  let token: string | null = null;
  let lockHeld = false;
  let firstMinted = 0;
  let secondMinted = 0;
  let secondResolved = false;
  const firstMintStarted = deferred();
  const releaseFirstMint = deferred();
  const secondWaiting = deferred();
  const releaseSecondPoll = deferred();

  const redis: TokenStoreRedis = {
    ...idle,
    async getToken() {
      return token;
    },
    async setToken(value) {
      token = value;
    },
    async tryAcquireTokenLock() {
      if (!lockHeld) {
        lockHeld = true;
        return true;
      }
      return false;
    },
    async deleteTokenIfEqual() {},
  };
  const store = createTokenStore(redis, {
    wait: async () => {
      secondWaiting.resolve();
      await releaseSecondPoll.promise;
    },
  });

  const first = store.getOrCreateStoredToken(async () => {
    firstMinted += 1;
    firstMintStarted.resolve();
    await releaseFirstMint.promise;
    return "first-token";
  });

  await firstMintStarted.promise;
  const second = store.getOrCreateStoredToken(async () => {
    secondMinted += 1;
    return "second-token";
  });
  void second.then(() => {
    secondResolved = true;
  });

  await secondWaiting.promise;
  assert.equal(firstMinted, 1);
  assert.equal(secondMinted, 0, "the contender must not mint a token");
  assert.equal(secondResolved, false, "the contender must still be waiting");

  releaseFirstMint.resolve();
  assert.equal(await first, "first-token");
  releaseSecondPoll.resolve();
  assert.equal(await second, "first-token");
  assert.equal(secondMinted, 0);
});

test("the Redis lock has a finite eviction time", async () => {
  const commands: Array<Array<string | number>> = [];
  const redis = createUpstashTokenStore(async <T>(...command: Array<string | number>) => {
    commands.push(command);
    return "OK" as T;
  }, () => njtEnvironment("production"));

  assert.equal(await redis.tryAcquireTokenLock(), true);
  assert.deepEqual(commands, [
    [
      "SET",
      "departure-board:njt-token-lock:v1",
      commands[0][2],
      "NX",
      "EX",
      TOKEN_LOCK_SECONDS,
    ],
  ]);
});

test("a timed-out contender leaves minting to a later request after lock expiry", async () => {
  let currentTime = 0;
  let tokensMinted = 0;
  let lockEvicted = false;
  const redis: TokenStoreRedis = {
    ...idle,
    async getToken() {
      return null;
    },
    async setToken() {},
    async tryAcquireTokenLock() {
      return lockEvicted;
    },
    async deleteTokenIfEqual() {},
  };
  const store = createTokenStore(redis, {
    now: () => currentTime,
    wait: async () => {
      currentTime += 100;
    },
    waitTimeoutMilliseconds: 300,
  });

  await assert.rejects(
    store.getOrCreateStoredToken(async () => {
      tokensMinted += 1;
      return "unexpected";
    }),
    /Timed out waiting/,
  );
  assert.equal(tokensMinted, 0);

  // Redis evicts the abandoned lock after its EX duration. A later request can
  // then acquire it and mint the replacement token.
  lockEvicted = true;
  assert.equal(
    await store.getOrCreateStoredToken(async () => {
      tokensMinted += 1;
      return "replacement";
    }),
    "replacement",
  );
  assert.equal(tokensMinted, 1);
});

test("a failed mint starts a cooldown that makes every caller fail fast", async () => {
  let cooldown: number | null = null;
  let attempts = 0;
  const redis: TokenStoreRedis = {
    async getToken() {
      return null;
    },
    async setToken() {},
    async tryAcquireTokenLock() {
      return true;
    },
    async getMintCooldown() {
      return cooldown;
    },
    async setMintCooldown(retryAt) {
      cooldown = retryAt;
    },
    async deleteTokenIfEqual() {},
  };
  const store = createTokenStore(redis, { now: () => 1_000 });
  const refuse = async () => {
    attempts += 1;
    throw new NjtAuthError("NJT authentication failed: Daily usage limit reached");
  };

  await assert.rejects(store.getOrCreateStoredToken(refuse), /Daily usage limit/);
  assert.equal(cooldown, 1_000 + REFUSED_MINT_COOLDOWN_MS);
  await assert.rejects(store.getOrCreateStoredToken(refuse), TokenCooldownError);
  assert.equal(attempts, 1, "nobody tries getToken again during the cooldown");
});

test("a network failure cools down for less time than a refusal", async () => {
  let cooldown: number | null = null;
  const redis: TokenStoreRedis = {
    ...idle,
    async getToken() {
      return null;
    },
    async setToken() {},
    async tryAcquireTokenLock() {
      return true;
    },
    async setMintCooldown(retryAt) {
      cooldown = retryAt;
    },
    async deleteTokenIfEqual() {},
  };
  const store = createTokenStore(redis, { now: () => 0 });
  await assert.rejects(store.getOrCreateStoredToken(async () => {
    throw new Error("fetch failed");
  }));
  assert.equal(cooldown, FAILED_MINT_COOLDOWN_MS);
});

test("a minted token is returned even when storing it fails", async () => {
  const redis: TokenStoreRedis = {
    ...idle,
    async getToken() {
      return null;
    },
    async setToken() {
      throw new Error("ERR max requests limit exceeded");
    },
    async tryAcquireTokenLock() {
      return true;
    },
    async deleteTokenIfEqual() {},
  };
  const original = console.error;
  console.error = () => {};
  try {
    const store = createTokenStore(redis);
    assert.equal(await store.getOrCreateStoredToken(async () => "minted"), "minted");
  } finally {
    console.error = original;
  }
});

test("each NJ Transit backend keeps its token under its own key", async () => {
  const keysUsed: Array<string | number> = [];
  const record = async <T>(...command: Array<string | number>) => {
    keysUsed.push(command[1]);
    return null as T;
  };
  await createUpstashTokenStore(record, () => njtEnvironment("production")).getToken();
  await createUpstashTokenStore(record, () => njtEnvironment("test")).getToken();
  assert.deepEqual(keysUsed, ["departure-board:njt-token:v1", "departure-board:test:njt-token:v1"]);
});

test("the store refuses to touch Redis while NJT_ENV is unset", async () => {
  const previous = process.env.NJT_ENV;
  delete process.env.NJT_ENV;
  let called = false;
  try {
    const store = createUpstashTokenStore(async <T>() => {
      called = true;
      return null as T;
    });
    await assert.rejects(store.getToken(), /NJT_ENV must be/);
    assert.equal(called, false);
  } finally {
    if (previous !== undefined) process.env.NJT_ENV = previous;
  }
});

test("a contender that missed the cooldown cannot mint while the failed writer's lock stands", async () => {
  // The contender read "no cooldown" before the writer failed; it then finds
  // the lock still held, and the cooldown on its next poll.
  let cooldown: number | null = null;
  let lockFree = true;
  let cooldownReads = 0;
  let contenderMinted = false;
  const writerFailing = deferred();
  const redis: TokenStoreRedis = {
    async getToken() {
      return null;
    },
    async setToken() {},
    async tryAcquireTokenLock() {
      if (!lockFree) return false;
      lockFree = false;
      return true;
    },
    async getMintCooldown() {
      cooldownReads += 1;
      return cooldown;
    },
    async setMintCooldown(retryAt) {
      cooldown = retryAt;
    },
    async deleteTokenIfEqual() {},
  };
  const store = createTokenStore(redis, { now: () => 0, wait: async () => {} });
  const writer = store.getOrCreateStoredToken(async () => {
    await writerFailing.promise;
    throw new Error("fetch failed");
  });
  const contender = store.getOrCreateStoredToken(async () => {
    contenderMinted = true;
    return "should not mint";
  });
  writerFailing.resolve();
  await assert.rejects(writer, /fetch failed/);
  await assert.rejects(contender, TokenCooldownError);
  assert.equal(contenderMinted, false);
  assert.ok(cooldownReads >= 2);
});

test("every cooldown outlasts the mint lock", () => {
  assert.ok(FAILED_MINT_COOLDOWN_MS > TOKEN_LOCK_SECONDS * 1000);
  assert.ok(REFUSED_MINT_COOLDOWN_MS > TOKEN_LOCK_SECONDS * 1000);
});
