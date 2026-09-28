import { normalizeStationName, stations } from "./stations";

/**
 * Turns NJ Transit's raw departure records into the small, stable shape the UI
 * renders. Everything NJT-specific — Amtrak rows, non-revenue moves, Eastern
 * timestamps, free-text status strings — is dealt with here so the components
 * stay simple.
 */

/** A record from the API's `ITEMS` array. Only fields we actually use. */
export type RawDeparture = {
  SCHED_DEP_DATE: string;
  DESTINATION: string;
  // Usually a number-like string, but some single-platform stations return a
  // named value such as "Single".
  TRACK: string | number | null;
  LINE: string;
  LINECODE: string;
  LINEABBREVIATION: string;
  TRAIN_ID: string;
  CONNECTING_TRAIN_ID?: string;
  STATUS: string;
  SEC_LATE: string;
  INLINEMSG: string;
};

export type DepartureStatus =
  | "on-time"
  | "delayed"
  | "cancelled"
  | "boarding"
  | "departed";

/** A train's reported position; a position, never a posted track. */
export type TrainPosition = {
  /** The signal track circuit the train occupies, as RailData names it. */
  circuit: string;
  /** Whether its reported coordinates fall inside New York Penn Station. */
  atPenn: boolean;
  /** When the feed last updated this position, ISO 8601, if known. */
  updatedAt: string | null;
  /** The track this circuit's history most often led to, when it has any. */
  predictedTrack?: string;
  /** How confident that history makes the predicted track, 0–1. */
  confidence?: number;
};

export type Departure = {
  /** Stable identity across refreshes, so the list can update in place. */
  id: string;
  destination: string;
  /** True when NJT marks this trip as serving Newark Airport. */
  servesNewarkAirport?: boolean;
  /** True when NJT marks this trip as going via Secaucus. */
  viaSecaucus?: boolean;
  /** ISO 8601, so the client can render in the viewer's timezone. */
  scheduledTime: string;
  /** When the train should actually leave: scheduled time plus any delay. */
  expectedTime: string;
  trainNumber: string;
  line: string;
  lineCode: string;
  /** Track as NJT reports it. Empty until one is assigned. */
  track: string;
  /**
   * Where the train is right now, from RailData's vehicle feed. Set only at New
   * York Penn and only while `track` is still empty. See lib/trainPositions.
   */
  position?: TrainPosition;
  status: DepartureStatus;
  /** NJT's own wording, e.g. "in 13 Min" — shown verbatim when useful. */
  statusText: string;
  delayMinutes: number;
};

/**
 * Line codes we never show. The user rides NJT rail only, and the real-time
 * departures endpoint has no server-side filter for this, so we drop them here.
 */
const EXCLUDED_LINE_CODES = new Set(["AM", "SP"]);
const EXCLUDED_LINE_ABBREVIATIONS = new Set(["AMTK", "SEPTA"]);

/**
 * Train ID prefixes, per Appendix I of the RailData API manual:
 *   A = Amtrak, S = SEPTA, X = non-revenue (carries no passengers).
 */
const EXCLUDED_TRAIN_PREFIXES = /^[ASX]/i;

/**
 * Tracks are passed through as sent, including named values.
 *
 * Appendix II of the API manual lists railroad-to-public track translations
 * (Newark Airport "0" -> "A" and so on), but this endpoint already applies
 * them: Newark Airport returns "A", and Secaucus returns "E"/"F"/"G"/"H"
 * rather than digits. Translating again would be worse than useless — at
 * Metropark, where the API returns real public tracks 1-4, the appendix's
 * "2" -> "1" rule would send riders to the wrong platform.
 */
export function displayTrack(track: unknown): string {
  return typeof track === "string" || typeof track === "number"
    ? String(track).trim()
    : "";
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decodes the HTML entities NJ Transit embeds in text fields.
 *
 * Destinations arrive with markup in them — "Long Branch -SEC &#9992", where
 * &#9992 is the plane marking a train that serves Newark Airport. React escapes
 * strings, so without this the board would print the entity source instead of
 * the glyph. Note the trailing semicolon is optional in this feed, which is why
 * the pattern does not require one. Nullish input produces an empty string;
 * output has collapsed whitespace and no leading or trailing space.
 */
export function decodeEntities(value: string): string {
  return (value ?? "")
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&(\w+);/g, (match, name) => NAMED_ENTITIES[name] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

const DESTINATION_ALIASES: Record<string, string> = {
  // The RailData feed uses these shorter rider-facing forms while the station
  // directory keeps the official names used everywhere else in the app.
  msu: normalizeStationName("Montclair State University"),
  "new york": normalizeStationName("New York Penn Station"),
  "newark airport": normalizeStationName("Newark Airport"),
};

const STATION_BY_NAME = new Map(
  stations.map((station) => [normalizeStationName(station.name), station]),
);

export type NormalizedNjtDestination = {
  destination: string;
  servesNewarkAirport: boolean;
  viaSecaucus: boolean;
};

/**
 * Resolves RailData's compact destination notation into one canonical station
 * name plus trip attributes. `-SEC` and the plane mark are properties of the
 * trip, not part of the destination shown to a rider.
 */
export function normalizeNjtDestination(value: string): NormalizedNjtDestination {
  const decoded = decodeEntities(value);
  const servesNewarkAirport = decoded.includes("✈");
  const withoutAirportMark = decoded.replace(/✈\uFE0F?/g, "").trim();
  const viaSecaucus = /\s*-\s*SEC\s*$/i.test(withoutAirportMark);
  const baseName = withoutAirportMark.replace(/\s*-\s*SEC\s*$/i, "").trim();
  const normalized = normalizeStationName(baseName);
  const station = STATION_BY_NAME.get(DESTINATION_ALIASES[normalized] ?? normalized);
  const destination = station?.name ?? baseName;

  return {
    destination,
    servesNewarkAirport,
    viaSecaucus,
  };
}

/** True for train numbers this board should never show, by prefix alone. */
export function isExcludedTrainId(trainId: string): boolean {
  return EXCLUDED_TRAIN_PREFIXES.test((trainId ?? "").trim());
}

/**
 * The shape of an NJ Transit passenger train number, as this app defines it.
 *
 * This is the app's own spec, not NJ Transit's: no published format for
 * TRAIN_ID has been found beyond the prefixes above. It follows NJ Transit's
 * public numbering instead — a plain number of at most four digits, as in its
 * timetables (1 to 9999). Letters are left out entirely, which also turns away
 * every prefixed train (A, S, X) the board filters.
 *
 * Four digits rather than anything looser because each distinct id that
 * passes can cost an NJ Transit call from the shared daily allowance: this
 * caps the train pages and /api/stops/[train] at 9,999 possible ids instead
 * of an unbounded set. It does not stop someone walking all of them; the
 * Vercel firewall's rate limit on /api/* is what slows that down.
 *
 * If NJ Transit ever sends a board train outside this shape, its page would
 * 404; lib/departureBoard logs a warning when that happens, which is the
 * signal to revisit this spec.
 */
const NJT_TRAIN_NUMBER = /^\d{1,4}$/;

/** True for a train number this app would look up (see NJT_TRAIN_NUMBER). */
export function isNjtTrainId(trainId: string): boolean {
  return NJT_TRAIN_NUMBER.test((trainId ?? "").trim());
}

/** True for trains this board should never show. */
export function isExcluded(item: RawDeparture): boolean {
  return (
    EXCLUDED_LINE_CODES.has((item.LINECODE ?? "").toUpperCase()) ||
    EXCLUDED_LINE_ABBREVIATIONS.has(
      (item.LINEABBREVIATION ?? "").toUpperCase(),
    ) ||
    isExcludedTrainId(item.TRAIN_ID)
  );
}

/**
 * The zone NJ Transit's timestamps are in. Per the API manual, SCHED_DEP_DATE
 * is the departure time "at selected location" — always Eastern, with no
 * offset in the string.
 */
export const NJT_TIME_ZONE = "America/New_York";

/**
 * Eastern wall-clock time, from one formatter built once: constructing an
 * Intl.DateTimeFormat costs far more than using one, and the collector Worker
 * reads a timestamp for every train in the system on each run, inside a
 * 10 ms CPU budget.
 */
const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: NJT_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export type EasternClock = {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** What a clock in New York reads at `date`. */
export function easternClock(date: Date): EasternClock {
  const field: Record<string, number> = {};
  for (const part of EASTERN.formatToParts(date)) field[part.type] = Number(part.value);
  const { year, month, day, hour, minute, second } = field;
  // Some engines still render midnight as 24 in en-US despite h23.
  return { year, month, day, hour: hour % 24, minute, second };
}

/** How far Eastern wall-clock time is ahead of UTC at a given instant, in ms. */
function easternOffset(timestamp: number): number {
  const clock = easternClock(new Date(timestamp));
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  return asUtc - timestamp;
}

/**
 * Converts an Eastern wall-clock reading to the instant it refers to.
 *
 * Deliberately not `new Date(y, m, d, ...)`, which would interpret the reading
 * in whatever zone the server happens to run in — UTC on most hosts, putting
 * every departure four or five hours out. NJT's readings carry no offset, so a
 * time in the hour repeated at fall-back resolves to its first, daylight-time
 * occurrence.
 */
function fromEasternTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const asIfUtc = Date.UTC(year, month, day, hour, minute, second);
  let timestamp = asIfUtc - easternOffset(asIfUtc);
  // Around a DST change the first guess can land on the wrong side of the
  // transition, so resolve the offset once more at the corrected instant.
  const corrected = asIfUtc - easternOffset(timestamp);
  if (corrected !== timestamp) timestamp = corrected;
  return new Date(timestamp);
}

/** Parses NJT's "30-May-2024 11:56:00 AM" timestamps, which are Eastern time. */
export function parseNjtDate(value: string): Date | null {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/.exec(
    (value ?? "").trim(),
  );
  if (!match) return null;

  const [, day, monthName, year, rawHour, minute, second, meridiem] = match;
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  const month = months.indexOf(monthName.toLowerCase());
  if (month === -1) return null;

  let hour = Number(rawHour) % 12;
  if (meridiem.toUpperCase() === "PM") hour += 12;

  const date = fromEasternTime(
    Number(year),
    month,
    Number(day),
    hour,
    Number(minute),
    Number(second),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Renders an instant as a clock time, always Eastern rather than the viewer's
 * zone, so what is on screen matches the clock at the station. Checking New
 * York departures from another timezone should not shift every time on the
 * page.
 */
export function formatClock(
  iso: string,
  {
    locales,
    hour12,
  }: {
    locales?: Intl.LocalesArgument;
    hour12?: boolean;
  } = {},
): string {
  return new Date(iso).toLocaleTimeString(locales, {
    timeZone: NJT_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12,
  });
}

/**
 * Maps NJT's free-text status to a small enum. The raw text is kept alongside
 * it, so an unrecognised status still displays correctly — it just falls back
 * to being styled by lateness rather than by keyword.
 */
export function toStatus(statusText: string, delayMinutes: number): DepartureStatus {
  const text = (statusText ?? "").toLowerCase();
  if (text.includes("cancel")) return "cancelled";
  if (text.includes("depart")) return "departed";
  if (text.includes("all aboard") || text.includes("boarding")) return "boarding";
  if (text.includes("delay") || delayMinutes >= 1) return "delayed";
  return "on-time";
}

/**
 * Converts one non-excluded API item to a display departure. Invalid scheduled
 * timestamps return null; valid results use ISO instants and never have a
 * negative delay.
 */
export function normalizeDeparture(item: RawDeparture): Departure | null {
  const scheduled = parseNjtDate(item.SCHED_DEP_DATE);
  if (!scheduled) return null;

  const secondsLate = Number.parseInt(item.SEC_LATE ?? "0", 10);
  const delayMinutes = Number.isFinite(secondsLate)
    ? Math.max(0, Math.round(secondsLate / 60))
    : 0;
  const statusText = decodeEntities(item.STATUS);
  const expected = new Date(scheduled.getTime() + delayMinutes * 60_000);

  const destination = normalizeNjtDestination(item.DESTINATION);
  return {
    id: `${item.TRAIN_ID}-${scheduled.toISOString()}`,
    destination: destination.destination,
    servesNewarkAirport: destination.servesNewarkAirport,
    viaSecaucus: destination.viaSecaucus,
    scheduledTime: scheduled.toISOString(),
    expectedTime: expected.toISOString(),
    trainNumber: (item.TRAIN_ID ?? "").trim(),
    line: decodeEntities(item.LINE),
    lineCode: (item.LINECODE ?? "").trim().toUpperCase(),
    track: displayTrack(item.TRACK),
    status: toStatus(statusText, delayMinutes),
    statusText,
    delayMinutes,
  };
}

/**
 * Filters out non-NJT trains and normalizes the rest into the one chronological
 * sequence the rail board renders — the station's own concourse board is flat,
 * and a rail rider hunting one particular train scans it that way.
 *
 * Ordered by when each train will actually leave rather than by its timetable
 * slot, so the countdown column reads straight down and a badly delayed train
 * does not sit above one that will depart sooner.
 */
export function normalizeDepartures(items: RawDeparture[]): Departure[] {
  return items
    .filter((item) => !isExcluded(item))
    .map((item) => normalizeDeparture(item))
    .filter((d): d is Departure => d !== null)
    .sort((a, b) => a.expectedTime.localeCompare(b.expectedTime));
}
