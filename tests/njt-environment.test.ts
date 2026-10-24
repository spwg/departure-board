import { describe, expect, it } from "vitest";
import { njtEnvironment, usingFixtures } from "@/lib/njtEnvironment";

describe("NJT_ENV", () => {
  it("gives production and test their own hosts and token keys", () => {
    const production = njtEnvironment("production");
    const test = njtEnvironment("test");
    expect(production.baseUrl).toBe("https://raildata.njtransit.com/api");
    expect(test.baseUrl).toBe("https://testraildata.njtransit.com/api");
    // Production keeps the names it used before the switch, so deploying it
    // reuses the stored token.
    expect(production.tokenKey).toBe("departure-board:njt-token:v1");
    const keys = (env: typeof production) => [env.tokenKey, env.lockKey, env.cooldownKey];
    for (const key of keys(test)) expect(keys(production)).not.toContain(key);
  });

  it("has no default: unset, empty, unknown or differently cased values throw", () => {
    for (const value of [undefined, "", "prod", "Production", "development", "toString", "__proto__"]) {
      expect(() => njtEnvironment(value), String(value)).toThrow(/NJT_ENV must be "production" or "test"/);
    }
  });

  it("is needed only when NJ Transit would actually be called", () => {
    expect(usingFixtures({})).toBe(true);
    expect(usingFixtures({ NJT_API_USERNAME: "u", NJT_API_PASSWORD: "p", NJT_USE_FIXTURES: "true" })).toBe(true);
    expect(usingFixtures({ NJT_API_USERNAME: "u", NJT_API_PASSWORD: "p" })).toBe(false);
  });
});
