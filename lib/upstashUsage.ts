/**
 * A daily check that the Upstash database will stay inside the free plan's
 * monthly command allowance. The collector Worker runs it once a day (see
 * USAGE_CRON in collector/worker.ts): it reads this month's and today's
 * command counts from Upstash's Developer API, projects the month's total and
 * reports to a Healthchecks.io check of its own.
 *
 * - On pace: a normal ping.
 * - Over pace, or the stats could not be read: a ping to the check's /fail
 *   URL, which alerts at once, with the figures or the error in the body.
 * - The check never runs (cron, deploy or Worker broken): no ping, so the
 *   check's 1-day period lapses and Healthchecks.io alerts anyway.
 *
 * Secrets (wrangler secret put): UPSTASH_EMAIL and UPSTASH_API_KEY (a
 * Developer API key, Upstash console → Account → API Keys), UPSTASH_DATABASE_ID
 * (the database's id, from its console URL) and USAGE_HEALTHCHECK_URL. Without
 * USAGE_HEALTHCHECK_URL the check does nothing.
 */

/** The free plan's monthly command allowance. */
export const MONTHLY_COMMAND_LIMIT = 500_000;
/** Alert when the month is projected past this, leaving room to react. */
export const ALERT_THRESHOLD = 450_000;

const STATS_URL = "https://api.upstash.com/v2/redis/stats/";
const HOUR = 3_600_000;

export type UsageCounts = { monthToDate: number; today: number };

export type UsageReport = {
  event: "upstash-usage";
  at: string;
  monthToDate: number;
  today: number;
  /** Commands per day at the pace used for the projection. */
  dailyPace: number;
  projected: number;
  threshold: number;
  limit: number;
  overPace: boolean;
};

/**
 * Projects the month's total from the commands used so far. The pace is the
 * faster of the month's average and today's, so a spike shows the day it
 * starts instead of being diluted by a quiet month. Today's pace counts only
 * after an hour of the day, when it is more than noise. Months and days are
 * taken as UTC, as Upstash counts them.
 */
export function projectUsage(counts: UsageCounts, now: Date): UsageReport {
  const t = now.getTime();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const monthElapsed = t - monthStart;
  const dayElapsed = t - dayStart;
  const monthPace = monthElapsed > 0 ? counts.monthToDate / monthElapsed : 0;
  const todayPace = dayElapsed >= HOUR ? counts.today / dayElapsed : 0;
  const pace = Math.max(monthPace, todayPace); // commands per millisecond

  const projected = Math.round(counts.monthToDate + pace * (monthEnd - t));
  return {
    event: "upstash-usage",
    at: now.toISOString(),
    monthToDate: counts.monthToDate,
    today: counts.today,
    dailyPace: Math.round(pace * 24 * HOUR),
    projected,
    threshold: ALERT_THRESHOLD,
    limit: MONTHLY_COMMAND_LIMIT,
    overPace: projected > ALERT_THRESHOLD || counts.monthToDate >= ALERT_THRESHOLD,
  };
}

/** Reads this month's and today's command counts from the Developer API. */
export async function fetchUsageCounts(
  credentials: { email: string; apiKey: string; databaseId: string },
): Promise<UsageCounts> {
  const auth = btoa(`${credentials.email}:${credentials.apiKey}`);
  const response = await fetch(STATS_URL + encodeURIComponent(credentials.databaseId), {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Upstash stats HTTP ${response.status}`);
  const body = (await response.json()) as { total_monthly_requests?: unknown; daily_net_commands?: unknown };
  const monthToDate = body.total_monthly_requests;
  const today = body.daily_net_commands;
  if (typeof monthToDate !== "number" || typeof today !== "number") {
    throw new Error("Upstash stats lacked total_monthly_requests or daily_net_commands");
  }
  return { monthToDate, today };
}

/**
 * Runs the check and pings USAGE_HEALTHCHECK_URL with the outcome. Never
 * throws: monitoring must not break the Worker.
 */
export async function checkUsage(now: Date = new Date()): Promise<void> {
  const pingUrl = process.env.USAGE_HEALTHCHECK_URL;
  if (!pingUrl) return;

  let ok: boolean;
  let body: string;
  try {
    const email = process.env.UPSTASH_EMAIL;
    const apiKey = process.env.UPSTASH_API_KEY;
    const databaseId = process.env.UPSTASH_DATABASE_ID;
    if (!email || !apiKey || !databaseId) {
      throw new Error("UPSTASH_EMAIL, UPSTASH_API_KEY and UPSTASH_DATABASE_ID must all be set");
    }
    const report = projectUsage(await fetchUsageCounts({ email, apiKey, databaseId }), now);
    console.log(JSON.stringify(report));
    ok = !report.overPace;
    body = JSON.stringify(report);
  } catch (error) {
    console.error(JSON.stringify({ event: "upstash-usage-failed", at: now.toISOString(), error: String(error) }));
    ok = false;
    body = JSON.stringify({ event: "upstash-usage-failed", error: String(error) });
  }

  try {
    const url = ok ? pingUrl : `${pingUrl.replace(/\/+$/, "")}/fail`;
    const response = await fetch(url, { method: "POST", body, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error(JSON.stringify({ event: "usage-healthcheck-ping-failed", error: String(error) }));
  }
}
