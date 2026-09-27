import { describe, expect, it, vi } from "vitest";
import { createSubwayAlertSource } from "@/lib/subwayAlertSource";
import { matchSubwayAlerts, parseSubwayAlerts, type SubwayAlertFeed } from "@/lib/subwayAlerts";

vi.mock("server-only", () => ({}));

const NOW = Date.parse("2026-09-27T18:00:00.000Z");
const at = (iso: string) => Date.parse(iso) / 1000;
const en = (text: string) => ({ translation: [{ text, language: "en" }, { text: `<p>${text}</p>`, language: "en-html" }] });

const feed: SubwayAlertFeed = {
  entity: [
    {
      id: "delay",
      alert: {
        active_period: [{ start: at("2026-09-27T17:30:00.000Z") }],
        informed_entity: [{ route_id: "FS" }],
        header_text: en("[FS] trains are running with delays after we removed a train from service."),
        "transit_realtime.mercury_alert": { alert_type: "Delays", updated_at: at("2026-09-27T17:30:00.000Z") },
      },
    },
    {
      id: "reroute",
      alert: {
        active_period: [{ start: at("2026-09-27T12:00:00.000Z"), end: at("2026-09-28T06:00:00.000Z") }],
        informed_entity: [{ route_id: "C" }, { route_id: "C" }],
        header_text: en("[C] service is rerouted"),
        description_text: en("[accessibility icon] Take the [A] instead."),
        "transit_realtime.mercury_alert": { alert_type: "Planned - Reroute" },
      },
    },
    {
      id: "later",
      alert: {
        active_period: [{ start: at("2026-10-03T00:00:00.000Z") }],
        informed_entity: [{ route_id: "6" }],
        header_text: en("[6] skips stops next weekend"),
        "transit_realtime.mercury_alert": { alert_type: "Planned - Stops Skipped" },
      },
    },
    {
      id: "express",
      alert: {
        informed_entity: [{ route_id: "6" }],
        header_text: en("[6] trains are delayed"),
        "transit_realtime.mercury_alert": { alert_type: "Delays" },
      },
    },
  ],
};

describe("Subway alerts", () => {
  it("keeps only alerts showing now, in plain English, sorted into disruptions and advisories", () => {
    const alerts = parseSubwayAlerts(feed, NOW);
    expect(alerts.map((alert) => alert.id)).toEqual(["delay", "reroute", "express"]);

    const [delay, reroute] = alerts;
    expect(delay!.severity).toBe("disruption");
    expect(delay!.text).not.toContain("<p>");
    expect(delay!.url).toBeUndefined();
    expect(reroute!.severity).toBe("advisory");
    expect(reroute!.routes).toEqual(["C"]);
    expect(reroute!.details).toBe("Take the [A] instead.");
  });

  it("matches a train's route, sharing the local's alerts with the diamond express", () => {
    const alerts = parseSubwayAlerts(feed, NOW);
    expect(matchSubwayAlerts(alerts, "C").map((alert) => alert.id)).toEqual(["reroute"]);
    expect(matchSubwayAlerts(alerts, "6X").map((alert) => alert.id)).toEqual(["express"]);
    expect(matchSubwayAlerts(alerts, "A")).toEqual([]);
  });

  it("caches the feed briefly and returns every live revision for dismissals", async () => {
    let now = NOW;
    const fetcher = vi.fn(async () => new Response(JSON.stringify(feed)));
    const source = createSubwayAlertSource(fetcher as unknown as typeof fetch, () => now);

    const snapshot = await source.getSnapshot("FS");
    expect(snapshot.advisories.map((notice) => notice.id)).toEqual(["delay"]);
    expect(snapshot.advisories[0]).not.toHaveProperty("routes");
    expect(Object.keys(snapshot.authoritativeRevisions)).toEqual(["delay", "reroute", "express"]);

    await source.getSnapshot("C");
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 91_000;
    await source.getSnapshot("C");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
