import "server-only";
import { createSharedLoader } from "./sharedLoader";
import type { ServiceAdvisory } from "./serviceAdvisories";
import type { ServiceAdvisorySnapshot } from "./serviceAdvisorySource";
import { matchSubwayAlerts, parseSubwayAlerts, type SubwayAlert, type SubwayAlertFeed } from "./subwayAlerts";

/** MTA's public Subway alerts feed, as JSON; it needs no API key. */
const SUBWAY_ALERTS_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json";
const CACHE_MS = 90_000;
/** How long a failed fetch is remembered before MTA's feed is asked again. */
const FAILURE_BACKOFF_MS = 15_000;

type Fetcher = typeof fetch;

/**
 * Builds an injectable, briefly cached alerts source. A failure is remembered
 * for only a few seconds (lib/sharedLoader), so it never outlives a short blip.
 */
export function createSubwayAlertSource(
  fetcher: Fetcher = fetch,
  clock: () => number = Date.now,
) {
  const get = createSharedLoader(
    async (): Promise<SubwayAlert[]> => {
      const response = await fetcher(SUBWAY_ALERTS_URL, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Subway alerts failed: ${response.status}`);
      const feed: SubwayAlertFeed = await response.json();
      return parseSubwayAlerts(feed, clock());
    },
    { ttlMs: CACHE_MS, failureBackoffMs: FAILURE_BACKOFF_MS, clock },
  );

  return {
    /**
     * One route's alerts, plus the identity of every alert showing now, so a
     * browser drops a local dismissal only once MTA removes or changes it.
     */
    async getSnapshot(route: string): Promise<ServiceAdvisorySnapshot> {
      const alerts = await get();
      return {
        advisories: matchSubwayAlerts(alerts, route).map(toNotice),
        authoritativeRevisions: Object.fromEntries(alerts.map((alert) => [alert.id, alert.revision])),
      };
    },
  };
}

/** Drops the matching-only route list before a notice goes to the browser. */
function toNotice(alert: SubwayAlert): ServiceAdvisory {
  const notice: ServiceAdvisory & { routes?: string[] } = { ...alert };
  delete notice.routes;
  return notice;
}

const source = createSubwayAlertSource();

export async function getSubwayAlertSnapshot(route: string): Promise<ServiceAdvisorySnapshot> {
  return source.getSnapshot(route);
}
