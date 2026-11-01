import { afterEach, describe, expect, it, vi } from "vitest";
import { ALERT_THRESHOLD, checkUsage, fetchUsageCounts, projectUsage } from "@/lib/upstashUsage";

const ENV = ["USAGE_HEALTHCHECK_URL", "UPSTASH_EMAIL", "UPSTASH_API_KEY", "UPSTASH_DATABASE_ID"] as const;
afterEach(() => { for (const name of ENV) delete process.env[name]; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function configure() {
  process.env.USAGE_HEALTHCHECK_URL = "https://hc-ping.example/usage";
  process.env.UPSTASH_EMAIL = "me@example.com";
  process.env.UPSTASH_API_KEY = "key";
  process.env.UPSTASH_DATABASE_ID = "db-1";
}

/** fetch answering the stats call with `stats` (or `statsStatus`) and every ping with 200. */
function stubFetch(stats: unknown, statsStatus = 200) {
  const fetchMock = vi.fn(async (url: string) =>
    url.startsWith("https://api.upstash.com/")
      ? new Response(JSON.stringify(stats), { status: statsStatus })
      : new Response("OK"));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const pings = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls
    .map((call) => call as unknown as [string, RequestInit | undefined])
    .filter(([url]) => url.startsWith("https://hc-ping.example/"));

describe("projectUsage", () => {
  it("projects the month at the month's pace when today is no faster", () => {
    // 7K commands 18½ hours into November: about 9K a day, 273K for the month.
    const report = projectUsage({ monthToDate: 7_000, today: 7_000 }, new Date("2026-11-01T18:28:00Z"));
    expect(report.projected).toBeGreaterThan(270_000);
    expect(report.projected).toBeLessThan(276_000);
    expect(report.dailyPace).toBe(9_097);
    expect(report.overPace).toBe(false);
  });

  it("uses today's pace when a spike makes it faster than the month's", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(projectUsage({ monthToDate: 200_000, today: 5_000 }, now).overPace).toBe(false);
    const spiking = projectUsage({ monthToDate: 200_000, today: 15_000 }, now);
    expect(spiking.dailyPace).toBe(30_000);
    expect(spiking.projected).toBe(515_000);
    expect(spiking.overPace).toBe(true);
  });

  it("ignores today's pace in the day's first hour", () => {
    const report = projectUsage({ monthToDate: 90_000, today: 5_000 }, new Date("2026-11-10T00:30:00Z"));
    expect(report.overPace).toBe(false);
  });

  it("is over pace once the month has used the threshold, however it got there", () => {
    const report = projectUsage({ monthToDate: ALERT_THRESHOLD, today: 0 }, new Date("2026-11-30T23:59:00Z"));
    expect(report.overPace).toBe(true);
  });
});

describe("fetchUsageCounts", () => {
  it("reads the month's and today's commands with the Developer API key", async () => {
    const fetchMock = stubFetch({ total_monthly_requests: 7_000, daily_net_commands: 1_200 });
    await expect(fetchUsageCounts({ email: "me@example.com", apiKey: "key", databaseId: "db-1" }))
      .resolves.toEqual({ monthToDate: 7_000, today: 1_200 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.upstash.com/v2/redis/stats/db-1");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa("me@example.com:key")}`);
  });

  it("rejects a reply without the counts", async () => {
    stubFetch({ daily_net_commands: 1 });
    await expect(fetchUsageCounts({ email: "e", apiKey: "k", databaseId: "d" })).rejects.toThrow(/total_monthly_requests/);
  });
});

describe("checkUsage", () => {
  it("does nothing without a usage health check", async () => {
    const fetchMock = stubFetch({});
    await checkUsage();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pings the check with the report when on pace", async () => {
    configure();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = stubFetch({ total_monthly_requests: 7_000, daily_net_commands: 7_000 });
    await checkUsage(new Date("2026-11-01T18:28:00Z"));
    const sent = pings(fetchMock);
    expect(sent).toHaveLength(1);
    expect(sent[0][0]).toBe("https://hc-ping.example/usage");
    expect(JSON.parse(sent[0][1]!.body as string)).toMatchObject({ event: "upstash-usage", monthToDate: 7_000, overPace: false });
  });

  it("signals a failure when over pace", async () => {
    configure();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = stubFetch({ total_monthly_requests: 200_000, daily_net_commands: 15_000 });
    await checkUsage(new Date("2026-11-20T12:00:00Z"));
    const sent = pings(fetchMock);
    expect(sent.map(([url]) => url)).toEqual(["https://hc-ping.example/usage/fail"]);
    expect(JSON.parse(sent[0][1]!.body as string)).toMatchObject({ projected: 515_000, overPace: true });
  });

  it("signals a failure, with the reason, when the stats cannot be read or are not configured", async () => {
    configure();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fetchMock = stubFetch({ error: "unauthorized" }, 401);
    await checkUsage();
    let sent = pings(fetchMock);
    expect(sent.map(([url]) => url)).toEqual(["https://hc-ping.example/usage/fail"]);
    expect(sent[0][1]!.body).toContain("HTTP 401");

    delete process.env.UPSTASH_API_KEY;
    fetchMock = stubFetch({});
    await checkUsage();
    sent = pings(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent[0][0]).toBe("https://hc-ping.example/usage/fail");
    expect(sent[0][1]!.body).toContain("must all be set");
  });

  it("survives a ping that fails", async () => {
    configure();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.startsWith("https://api.upstash.com/")
      ? new Response(JSON.stringify({ total_monthly_requests: 1, daily_net_commands: 1 }))
      : new Response("gone", { status: 404 })));
    await expect(checkUsage(new Date("2026-11-02T12:00:00Z"))).resolves.toBeUndefined();
    expect(JSON.parse(error.mock.calls[0][0] as string)).toEqual({ event: "usage-healthcheck-ping-failed", error: "Error: HTTP 404" });
  });
});
