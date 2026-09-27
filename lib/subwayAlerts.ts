import { advisoryRevision, type ServiceAdvisory } from "./serviceAdvisories";

/**
 * The slice of MTA's Subway alerts feed (GTFS-realtime as JSON, with MTA's
 * "Mercury" extensions) that the app reads.
 */
type Translated = { translation?: { text?: string; language?: string }[] };

type FeedAlert = {
  active_period?: { start?: number; end?: number }[];
  informed_entity?: { route_id?: string }[];
  header_text?: Translated;
  description_text?: Translated;
  "transit_realtime.mercury_alert"?: {
    alert_type?: string;
    updated_at?: number;
    display_before_active?: number;
  };
};

export type SubwayAlertFeed = {
  header?: { timestamp?: number };
  entity?: { id?: string; alert?: FeedAlert }[];
};

/** One official MTA alert, in the app's notice shape plus the routes it names. */
export type SubwayAlert = ServiceAdvisory & { routes: string[] };

/**
 * MTA alert types that describe a scheduled change or general information,
 * as opposed to something going wrong now. Anything else — "Delays",
 * "Reduced Service", an unplanned suspension — is a current disruption.
 */
function isPlanned(alertType: string): boolean {
  return (
    alertType.startsWith("Planned") ||
    ["Boarding Change", "Extra Service", "Special Schedule", "Station Notice"].includes(alertType)
  );
}

/** The plain-English text; the feed also carries an HTML rendering. */
function english(value: Translated | undefined): string {
  const text = value?.translation?.find((entry) => entry.language === "en")?.text ?? "";
  return text
    // MTA writes these pictograms as bracketed words; they read as noise.
    .replace(/\[(accessibility|shuttle bus) icon\]\s*/gi, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Whether MTA means the alert to be shown at `now` (seconds). */
function isShowing(alert: FeedAlert, now: number): boolean {
  const periods = alert.active_period ?? [];
  if (periods.length === 0) return true;
  const lead = alert["transit_realtime.mercury_alert"]?.display_before_active ?? 0;
  return periods.some((period) =>
    (period.start ?? 0) - lead <= now && (period.end === undefined || now < period.end),
  );
}

/**
 * Turns MTA's feed into notices showing now. Alerts scheduled for later are
 * left out: a rider looking at a train wants what affects it today.
 */
export function parseSubwayAlerts(feed: SubwayAlertFeed, nowMs: number): SubwayAlert[] {
  const now = Math.floor(nowMs / 1000);
  const alerts: SubwayAlert[] = [];
  const seen = new Set<string>();

  for (const entity of feed.entity ?? []) {
    const alert = entity.alert;
    const id = entity.id;
    if (!alert || !id || seen.has(id) || !isShowing(alert, now)) continue;
    const text = english(alert.header_text);
    if (!text) continue;
    seen.add(id);

    const mercury = alert["transit_realtime.mercury_alert"];
    const severity = isPlanned(mercury?.alert_type ?? "") ? "advisory" : "disruption";
    const details = english(alert.description_text) || undefined;
    const publishedAt = mercury?.updated_at
      ? new Date(mercury.updated_at * 1000).toISOString()
      : null;
    const routes = [
      ...new Set(
        (alert.informed_entity ?? [])
          .map((entry) => entry.route_id)
          .filter((route): route is string => Boolean(route)),
      ),
    ];

    alerts.push({
      id,
      text,
      details,
      severity,
      publishedAt,
      routes,
      revision: advisoryRevision(id, `${text}\u0000${details ?? ""}`, undefined, severity, publishedAt),
    });
  }

  return alerts;
}

/**
 * The route an alert would name for a train. MTA runs the diamond express
 * 6 and 7 on the same lines as their locals and files alerts under the
 * local's route, so an express train shares them.
 */
function alertRoute(route: string): string {
  return route === "6X" || route === "7X" ? route.slice(0, 1) : route;
}

/** The alerts that name a train's route. */
export function matchSubwayAlerts(alerts: SubwayAlert[], route: string): SubwayAlert[] {
  const wanted = new Set([route, alertRoute(route)]);
  return alerts.filter((alert) => alert.routes.some((named) => wanted.has(alertRoute(named))));
}
