import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CollectSummary } from "@/lib/pennCollect";

const collectPenn = vi.fn();
vi.mock("@/lib/pennCollect", () => ({ collectPenn }));
const checkUsage = vi.fn(async () => {});
vi.mock("@/lib/upstashUsage", () => ({ checkUsage }));
vi.mock("@/lib/njtTokenStore", () => ({ getOrCreateStoredToken: vi.fn(), invalidateStoredToken: vi.fn(), redisCommand: vi.fn() }));
afterEach(() => { delete process.env.HEALTHCHECK_URL; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const healthy: CollectSummary = { event: "penn-collect", at: "2026-09-28T01:19:36.114Z", departures: 15, predicted: 2, recorded: 1, logged: 3, vehicles: true, history: true };

describe("collector Worker health pings", () => {
  it("pings the health check with the summary after a run that could predict", async () => {
    process.env.HEALTHCHECK_URL = "https://hc-ping.example/abc";
    const fetchMock = vi.fn(async () => new Response("OK")); vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    collectPenn.mockResolvedValue(healthy);
    const { collect } = await import("@/collector/worker");
    await collect();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hc-ping.example/abc");
    expect(JSON.parse(init.body as string)).toEqual(healthy);
  });

  it("stays silent after a failed or degraded run, so the monitor notices the missing pings", async () => {
    process.env.HEALTHCHECK_URL = "https://hc-ping.example/abc";
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
    const { collect } = await import("@/collector/worker");
    collectPenn.mockRejectedValueOnce(new Error("NJT down"));
    await collect();
    collectPenn.mockResolvedValueOnce({ ...healthy, vehicles: false, history: false });
    await collect();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing without a health check configured, and survives a failed ping", async () => {
    const { reportHealthy } = await import("@/collector/worker");
    const fetchMock = vi.fn(async () => { throw new Error("offline"); }); vi.stubGlobal("fetch", fetchMock);
    await reportHealthy(healthy);
    expect(fetchMock).not.toHaveBeenCalled();
    process.env.HEALTHCHECK_URL = "https://hc-ping.example/abc";
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(reportHealthy(healthy)).resolves.toBeUndefined();
  });

  it("logs a ping the health check refused, without affecting collection", async () => {
    process.env.HEALTHCHECK_URL = "https://hc-ping.example/revoked";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { reportHealthy } = await import("@/collector/worker");
    await expect(reportHealthy(healthy)).resolves.toBeUndefined();
    expect(JSON.parse(error.mock.calls[0][0] as string)).toEqual({ event: "healthcheck-ping-failed", error: "Error: HTTP 404" });
  });
});

describe("collector Worker crons", () => {
  const run = async (cron: string) => {
    const { default: worker } = await import("@/collector/worker");
    const pending: Promise<unknown>[] = [];
    worker.scheduled({ cron }, {}, { waitUntil: (promise) => { pending.push(promise); } });
    await Promise.all(pending);
  };

  it("runs the usage check on its daily cron and collects on every other", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    collectPenn.mockResolvedValue({ ...healthy, vehicles: false });
    const { USAGE_CRON } = await import("@/collector/worker");
    await run(USAGE_CRON);
    expect(checkUsage).toHaveBeenCalledTimes(1);
    expect(collectPenn).not.toHaveBeenCalled();
    await run("* * * * *");
    expect(checkUsage).toHaveBeenCalledTimes(1);
    expect(collectPenn).toHaveBeenCalledTimes(1);
  });

  it("lists both crons in wrangler.toml", async () => {
    const { USAGE_CRON } = await import("@/collector/worker");
    const toml = readFileSync(path.resolve(process.cwd(), "collector/wrangler.toml"), "utf8");
    const crons = toml.match(/^crons = (\[.*\])$/m)?.[1];
    expect(JSON.parse(crons ?? "[]")).toEqual(["* * * * *", USAGE_CRON]);
  });
});
