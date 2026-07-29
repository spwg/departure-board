import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createServiceAdvisorySource,
  matchServiceAdvisories,
  parseServiceAdvisories,
} from "@/lib/serviceAdvisorySource";
import {
  dismissServiceAdvisory,
  visibleServiceAdvisories,
} from "@/lib/serviceAdvisoryDismissals";

vi.mock("server-only", () => ({}));

const feed = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <description>Northeast Corridor Line service is suspended because of signal trouble.</description>
    <link>https://www.njtransit.com/node/active</link>
    <guid>active-1</guid><advisoryAlert>0</advisoryAlert>
    <pubDate>Tue, 28 Jul 2026 22:04:37 -0400</pubDate>
  </item>
  <item>
    <description>New York Penn Station: Escalator maintenance &amp;amp; closure — Saturday.</description>
    <alert_message_components><URL>https://www.njtransit.com/station-advisory/plan</URL></alert_message_components>
    <link>https://www.njtransit.com/node/plan</link>
    <guid>planned-1</guid><advisoryAlert>1</advisoryAlert>
    <pubDate>Tue, 28 Jul 2026 21:00:00 -0400</pubDate>
  </item>
  <item>
    <description>Raritan Valley Line: Track maintenance this weekend.</description>
    <link>https://www.njtransit.com/node/other</link>
    <guid>other-1</guid><advisoryAlert>1</advisoryAlert>
  </item>
  <item>
    <description>Princeton Dinky: Buses replace trains this weekend.</description>
    <link>https://www.njtransit.com/node/dinky</link>
    <guid>dinky-1</guid><advisoryAlert>1</advisoryAlert>
  </item>
</channel></rss>`;

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("service-advisory source", () => {
  it("parses official RSS notices, retaining their official link and active-disruption signal", () => {
    expect(parseServiceAdvisories(feed)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "active-1",
        text: "Northeast Corridor Line service is suspended because of signal trouble.",
        url: "https://www.njtransit.com/node/active",
        severity: "disruption",
      }),
      expect.objectContaining({
        id: "planned-1",
        text: "New York Penn Station: Escalator maintenance & closure — Saturday.",
        url: "https://www.njtransit.com/station-advisory/plan",
        severity: "advisory",
      }),
    ]));
  });

  it("matches a station board by its station or rail lines, and a train page by line only", () => {
    const advisories = parseServiceAdvisories(feed);
    expect(matchServiceAdvisories(advisories, {
      station: { name: "New York Penn Station", lines: ["NE"] },
    }).map((notice) => notice.id)).toEqual(["active-1", "planned-1"]);
    expect(matchServiceAdvisories(advisories, { lineCodes: ["NE"] }).map((notice) => notice.id)).toEqual(["active-1"]);
    expect(matchServiceAdvisories(advisories, { lineCodes: ["PR"] }).map((notice) => notice.id)).toEqual(["dinky-1"]);
  });

  it("briefly caches successful RSS responses without caching external failures", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(feed))
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(new Response("down", { status: 503 }));
    let now = 0;
    const source = createServiceAdvisorySource(fetcher, () => now);

    await expect(source.get()).resolves.toHaveLength(4);
    now = 30_000;
    await expect(source.get()).resolves.toHaveLength(4);
    expect(fetcher).toHaveBeenCalledTimes(1);

    now = 120_000;
    await expect(source.get()).rejects.toThrow("Rail advisory RSS failed: 503");
    await expect(source.get()).rejects.toThrow("Rail advisory RSS failed: 503");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("returns contextual notices with revisions for the entire authoritative feed", async () => {
    const source = createServiceAdvisorySource(vi.fn().mockResolvedValue(new Response(feed)));
    const snapshot = await source.getSnapshot({
      station: { name: "New York Penn Station", lines: ["NE"] },
    });
    const allNotices = parseServiceAdvisories(feed);

    expect(snapshot.advisories.map((notice) => notice.id)).toEqual(["active-1", "planned-1"]);
    expect(snapshot.authoritativeRevisions).toEqual(
      Object.fromEntries(allNotices.map((notice) => [notice.id, notice.revision])),
    );
  });
});

describe("dismissed service banners", () => {
  it("dismisses one exact notice only, and makes it visible again when the official notice changes or is replaced", () => {
    const [active, planned] = parseServiceAdvisories(feed);
    dismissServiceAdvisory(active);
    expect(visibleServiceAdvisories([active, planned], {
      [active.id]: active.revision,
      [planned.id]: planned.revision,
    })).toEqual([planned]);

    const changed = { ...active, text: `${active.text} Update: shuttle buses are running.`, revision: "changed" };
    expect(visibleServiceAdvisories([changed, planned], {
      [changed.id]: changed.revision,
      [planned.id]: planned.revision,
    })).toEqual([changed, planned]);

    const replacement = { ...active, id: "active-2", revision: "replacement" };
    dismissServiceAdvisory(active);
    expect(visibleServiceAdvisories([replacement, planned], {
      [replacement.id]: replacement.revision,
      [planned.id]: planned.revision,
    })).toEqual([replacement, planned]);
  });

  it("ends a dismissal when its exact official notice is removed from the authoritative feed", () => {
    const [active] = parseServiceAdvisories(feed);
    dismissServiceAdvisory(active);

    expect(visibleServiceAdvisories([], {})).toEqual([]);
    expect(visibleServiceAdvisories([active], { [active.id]: active.revision })).toEqual([active]);
  });

  it("does not clear a dismissal merely because a different station context omits it", () => {
    const [active] = parseServiceAdvisories(feed);
    dismissServiceAdvisory(active);

    const authoritativeRevisions = { [active.id]: active.revision };
    expect(visibleServiceAdvisories([], authoritativeRevisions)).toEqual([]);
    expect(visibleServiceAdvisories([active], authoritativeRevisions)).toEqual([]);
  });
});
