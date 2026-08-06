import { afterEach, describe, expect, it, vi } from "vitest";

const cachedResults = new Map<string, unknown>();
const unstableCache = vi.fn((fn: (...args: unknown[]) => unknown) =>
  async (...args: unknown[]) => {
    const key = JSON.stringify(args);
    if (cachedResults.has(key)) return cachedResults.get(key);
    const result = await fn(...args);
    cachedResults.set(key, result);
    return result;
  },
);
vi.mock("next/cache", () => ({ unstable_cache: unstableCache }));
vi.mock("@/lib/njtTokenStore", () => ({
  getOrCreateStoredToken: (mint: () => Promise<string>) => mint(),
  invalidateStoredToken: vi.fn(),
}));
vi.mock("server-only", () => ({}));

afterEach(() => { delete process.env.NJT_API_USERNAME; delete process.env.NJT_API_PASSWORD; delete process.env.NJT_API_BASE_URL; delete process.env.NJT_USE_FIXTURES; cachedResults.clear(); unstableCache.mockClear(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("NJT client contract", () => {
  it("uses fixtures while credentials are absent", async () => {
    const { fetchDepartures, usingFixtures } = await import("@/lib/njtClient");
    expect(usingFixtures()).toBe(true); expect((await fetchDepartures("NY")).length).toBeGreaterThan(4);
  });
  it("forces fixtures without contacting RailData when requested", async () => {
    process.env.NJT_API_USERNAME = "user"; process.env.NJT_API_PASSWORD = "pass"; process.env.NJT_USE_FIXTURES = "true";
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const { fetchDepartures, usingFixtures } = await import("@/lib/njtClient");
    expect(usingFixtures()).toBe(true); expect((await fetchDepartures("NY")).length).toBeGreaterThan(4); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("authenticates and sends a multipart schedule request when configured", async () => {
    process.env.NJT_API_USERNAME = "user"; process.env.NJT_API_PASSWORD = "pass"; process.env.NJT_API_BASE_URL = "https://api.example/";
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ UserToken: "token" }))).mockResolvedValueOnce(new Response(JSON.stringify({ ITEMS: [{ TRAIN_ID: "1" }] })));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchDepartures } = await import("@/lib/njtClient");
    expect(await fetchDepartures("ny")).toEqual([{ TRAIN_ID: "1" }]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example/TrainData/getToken"); expect(fetchMock.mock.calls[1][0]).toBe("https://api.example/TrainData/getTrainSchedule19Rec");
  });
  it("identifies rejected schedule tokens and reports malformed upstream data", async () => {
    process.env.NJT_API_USERNAME = "user"; process.env.NJT_API_PASSWORD = "pass";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ UserToken: "token" }))).mockResolvedValueOnce(new Response(JSON.stringify({ errorMessage: "Invalid token" }))));
    const { fetchDepartures, InvalidTokenError } = await import("@/lib/njtClient");
    await expect(fetchDepartures("NY")).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
