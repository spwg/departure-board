import { afterEach, describe, expect, it, vi } from "vitest";
import { collectOnce, collectorOptionsFromEnv, startCollector } from "@/lib/pennCollector";

afterEach(() => { vi.useRealTimers(); });

const ok = () => Promise.resolve(Response.json({ departures: 19, positioned: 4, predicted: 3 }));

describe("Penn collector", () => {
  it("targets its own server's record route and needs the shared secret", () => {
    expect(collectorOptionsFromEnv({ CRON_SECRET: "s", PORT: "8080" })).toEqual({ url: "http://127.0.0.1:8080/api/penn-positions/record", secret: "s", intervalMs: 30_000 });
    expect(collectorOptionsFromEnv({ CRON_SECRET: "s", PENN_COLLECTOR_INTERVAL_SECONDS: "60" })).toMatchObject({ url: "http://127.0.0.1:3000/api/penn-positions/record", intervalMs: 60_000 });
    expect(collectorOptionsFromEnv({})).toHaveProperty("error");
    expect(collectorOptionsFromEnv({ CRON_SECRET: "s", PENN_COLLECTOR_INTERVAL_SECONDS: "2" })).toHaveProperty("error");
  });

  it("reports each load as one structured line, and a failure without throwing", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(ok);
    expect(await collectOnce({ url: "http://x/r", secret: "s", fetch: fetchMock as never })).toMatchObject({ event: "penn-collect", ok: true, status: 200, departures: 19, predicted: 3 });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { authorization: "Bearer s" } });
    expect(await collectOnce({ url: "http://x/r", secret: "s", fetch: (() => Promise.reject(new Error("refused"))) as never })).toMatchObject({ ok: false, error: "Error: refused" });
  });

  it("loads the board once per interval, never overlapping, until stopped", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = () => resolve(Response.json({})); }));
    const lines: string[] = [];
    const stop = startCollector({ url: "http://x/r", secret: "s", intervalMs: 30_000, fetch: fetchMock as never, log: (line) => lines.push(line) });

    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(90_000); // still waiting on the first load
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "penn-collect", ok: true });

    stop();
    release();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
