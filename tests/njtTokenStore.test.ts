import assert from "node:assert/strict";
import test from "node:test";
import {
  createTokenStore,
  createUpstashTokenStore,
  TOKEN_LOCK_SECONDS,
  type TokenStoreRedis,
} from "../lib/njtTokenStore";

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
  });

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

test("a contender times out without minting if the lock never produces a token", async () => {
  let currentTime = 0;
  let tokensMinted = 0;
  const redis: TokenStoreRedis = {
    async getToken() {
      return null;
    },
    async setToken() {},
    async tryAcquireTokenLock() {
      return false;
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
});
