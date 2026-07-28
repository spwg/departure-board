import assert from "node:assert/strict";
import test from "node:test";
import { getOrCreateStoredToken } from "../lib/njtTokenStore";

test("concurrent cache misses mint exactly one NJT token", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-secret";

  let storedToken: string | null = null;
  let lockHeld = false;
  let lockAttempts = 0;
  let locksAcquired = 0;
  let tokensMinted = 0;

  globalThis.fetch = (async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as Array<string | number>;
    const [name, key, value, modifier] = command;

    if (name === "GET") {
      return Response.json({ result: storedToken });
    }

    if (name === "SET" && modifier === "NX") {
      lockAttempts += 1;
      if (lockHeld) return Response.json({ result: null });
      lockHeld = true;
      locksAcquired += 1;
      return Response.json({ result: "OK" });
    }

    if (name === "SET" && key === "departure-board:njt-token:v1") {
      storedToken = String(value);
      return Response.json({ result: "OK" });
    }

    throw new Error(`Unexpected Redis command: ${JSON.stringify(command)}`);
  }) as typeof fetch;

  try {
    const mintToken = async () => {
      tokensMinted += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return "shared-token";
    };

    const tokens = await Promise.all(
      Array.from({ length: 20 }, () => getOrCreateStoredToken(mintToken)),
    );

    assert.deepEqual(tokens, Array(20).fill("shared-token"));
    assert.equal(tokensMinted, 1);
    assert.equal(locksAcquired, 1);
    assert.ok(lockAttempts > 1, "the test must exercise lock contention");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
});
