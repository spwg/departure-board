import "server-only";
import { lineName } from "./stations";
import {
  advisoryRevision,
  type ServiceAdvisory,
} from "./serviceAdvisories";

const RAIL_ADVISORIES_URL =
  "https://www.njtransit.com/rss/RailAdvisories_feed.xml";
const CACHE_MS = 90_000;

export type AdvisoryMatch = {
  /** Provide station only for a station board. Train pages use lineCodes only. */
  station?: { code?: string; name: string; lines: string[] };
  lineCodes?: string[];
};

/** Contextual notices plus the identity/revision of every live RSS notice. */
export type ServiceAdvisorySnapshot = {
  advisories: ServiceAdvisory[];
  authoritativeRevisions: Record<string, string>;
};

type Fetcher = typeof fetch;

/** Collapses RSS entities and markup into the text a rider should read. */
function decodeXml(value: string): string {
  let decoded = value
    .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .trim();
  // The feed occasionally double-encodes ampersands, so decode until stable.
  for (let pass = 0; pass < 2; pass += 1) {
    decoded = decoded
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#x([0-9a-f]+);/gi, (_all, code: string) =>
        String.fromCodePoint(Number.parseInt(code, 16)),
      )
      .replace(/&#([0-9]+);/g, (_all, code: string) =>
        String.fromCodePoint(Number.parseInt(code, 10)),
      );
  }
  return decoded.replace(/\s+/g, " ").trim();
}

function rssTagText(item: string, name: string): string | null {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

/**
 * Turns NJ TRANSIT's official RSS XML into the small, stable contract the UI
 * needs. `advisoryAlert=0` is the feed's current-alert marker; its absence or
 * `1` is a lower-severity service/station advisory.
 */
export function parseServiceAdvisories(xml: string): ServiceAdvisory[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const seen = new Set<string>();
  const notices: ServiceAdvisory[] = [];

  for (const item of items) {
    const text = rssTagText(item, "description");
    const id = rssTagText(item, "guid") ?? rssTagText(item, "link");
    // Some items retain the notification link in <link>, but the nested URL
    // is the durable original advisory page when NJT supplies one.
    const url = rssTagText(item, "URL") ?? rssTagText(item, "link");
    if (!id || !text || !url || seen.has(id)) continue;
    seen.add(id);

    const publishedAt = rssTagText(item, "pubDate");
    const severity = rssTagText(item, "advisoryAlert") === "0"
      ? "disruption"
      : "advisory";
    notices.push({
      id,
      text,
      url,
      severity,
      publishedAt,
      revision: advisoryRevision(id, text, url, severity, publishedAt),
    });
  }

  return notices;
}

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mentions(text: string, target: string): boolean {
  const needle = normalized(target);
  if (!needle) return false;
  return ` ${normalized(text)} `.includes(` ${needle} `);
}

const LINE_ALIASES: Record<string, string[]> = {
  NE: ["Northeast Corridor Line", "Northeast Corridor", "NEC"],
  NC: ["North Jersey Coast Line", "NJCL"],
  PR: ["Princeton Branch", "Princeton Dinky", "Princeton Shuttle"],
  ME: ["Morris & Essex Line", "Morris & Essex Lines"],
  ML: ["Main Line", "Main-Bergen County Line"],
};

function termsForLine(code: string): string[] {
  return LINE_ALIASES[code] ?? [lineName(code)];
}

function termsForStation(station: NonNullable<AdvisoryMatch["station"]>): string[] {
  const plainName = station.name.replace(/\s+station$/i, "").trim();
  const aliases = station.code?.toUpperCase() === "NY"
    ? ["PSNY", "New York Penn"]
    : [];
  return [station.name, plainName, ...aliases];
}

/**
 * Narrows official notices to the current view. Station boards can match the
 * named station or any line it serves; train pages intentionally pass only a
 * line code so a station-only notice never leaks onto the stop list.
 */
export function matchServiceAdvisories(
  advisories: ServiceAdvisory[],
  match: AdvisoryMatch,
): ServiceAdvisory[] {
  const lineCodes = match.station?.lines ?? match.lineCodes ?? [];
  const lineTerms = lineCodes.flatMap(termsForLine);
  const stationTerms = match.station ? termsForStation(match.station) : [];
  return advisories.filter((notice) =>
    stationTerms.some((name) => mentions(notice.text, name)) ||
    lineTerms.some((name) => mentions(notice.text, name)),
  );
}

/** Builds an injectable briefly cached RSS source so failures never poison it. */
export function createServiceAdvisorySource(
  fetcher: Fetcher = fetch,
  clock: () => number = Date.now,
) {
  let cached: { at: number; notices: ServiceAdvisory[] } | null = null;

  const get = async (): Promise<ServiceAdvisory[]> => {
    const now = clock();
    if (cached && now - cached.at < CACHE_MS) return cached.notices;

    const response = await fetcher(RAIL_ADVISORIES_URL, {
      headers: { accept: "application/rss+xml, application/xml;q=0.9" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Rail advisory RSS failed: ${response.status}`);
    }
    const notices = parseServiceAdvisories(await response.text());
    cached = { at: now, notices };
    return notices;
  };

  return {
    get,
    async getSnapshot(match: AdvisoryMatch): Promise<ServiceAdvisorySnapshot> {
      const notices = await get();
      return {
        advisories: matchServiceAdvisories(notices, match),
        authoritativeRevisions: Object.fromEntries(
          notices.map((notice) => [notice.id, notice.revision]),
        ),
      };
    },
  };
}

const source = createServiceAdvisorySource();

/**
 * Returns contextual notices alongside the full feed's compact identity map.
 * The latter lets a browser discard a local dismissal only after the official
 * RSS feed has actually removed or changed that exact notice.
 */
export async function getServiceAdvisorySnapshot(
  match: AdvisoryMatch,
): Promise<ServiceAdvisorySnapshot> {
  return source.getSnapshot(match);
}

/** Returns all notices that apply to the station board or train page request. */
export async function getMatchingServiceAdvisories(
  match: AdvisoryMatch,
): Promise<ServiceAdvisory[]> {
  return (await getServiceAdvisorySnapshot(match)).advisories;
}
