/**
 * Which NJ Transit RailData backend this process talks to, read from NJT_ENV.
 *
 * It decides both the API host and the Redis keys the shared token, its mint
 * lock and its cooldown live under. Each backend rejects the other's tokens,
 * so a test server and production sharing one Upstash database must never
 * share a token key: each would keep replacing the other's token, spending
 * production's 10 daily getToken calls.
 *
 * There is no default. Assuming production on a test machine spends
 * production's tokens; assuming test in production breaks the site. An unset
 * or unknown value throws, and next.config.ts checks it at build and start
 * whenever NJ Transit credentials are configured.
 */

export type NjtEnvironmentName = "production" | "test";

export type NjtEnvironment = {
  name: NjtEnvironmentName;
  /** RailData's base URL, without a trailing slash. */
  baseUrl: string;
  tokenKey: string;
  lockKey: string;
  cooldownKey: string;
};

const ENVIRONMENTS: Record<NjtEnvironmentName, NjtEnvironment> = {
  production: {
    name: "production",
    // NJ Transit's developer portal documents raildata.njt.gov, but that name
    // has no A record yet. njtransit.com is the host that actually serves
    // traffic, and the one NJ Transit's own DepartureVision site calls.
    baseUrl: "https://raildata.njtransit.com/api",
    // The names production used before this switch existed, so deploying it
    // reuses the stored token instead of minting a new one.
    tokenKey: "departure-board:njt-token:v1",
    lockKey: "departure-board:njt-token-lock:v1",
    cooldownKey: "departure-board:njt-token-cooldown:v1",
  },
  test: {
    name: "test",
    baseUrl: "https://testraildata.njtransit.com/api",
    tokenKey: "departure-board:test:njt-token:v1",
    lockKey: "departure-board:test:njt-token-lock:v1",
    cooldownKey: "departure-board:test:njt-token-cooldown:v1",
  },
};

/** The backend NJT_ENV names. Throws unless it is exactly "production" or "test". */
export function njtEnvironment(value: string | undefined = process.env.NJT_ENV): NjtEnvironment {
  if (value !== undefined && Object.hasOwn(ENVIRONMENTS, value)) {
    return ENVIRONMENTS[value as NjtEnvironmentName];
  }
  throw new Error(
    `NJT_ENV must be "production" or "test", but it is ${value === undefined ? "unset" : JSON.stringify(value)}. ` +
      "It chooses the NJ Transit backend and its token keys, so it has no default.",
  );
}

/**
 * True when the app serves fixture data instead of calling NJ Transit: fixtures
 * are forced, or a credential is missing. NJT_ENV is needed only otherwise.
 */
export function usingFixtures(env: Record<string, string | undefined> = process.env): boolean {
  return env.NJT_USE_FIXTURES === "true" || !env.NJT_API_USERNAME || !env.NJT_API_PASSWORD;
}
