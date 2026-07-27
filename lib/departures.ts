/**
 * Turns NJ Transit's raw departure records into the small, stable shape the UI
 * renders. Everything NJT-specific — Amtrak rows, non-revenue moves, railroad
 * vs. public track numbering, status strings — is dealt with here so the
 * components stay simple.
 */

/** A record from the API's `ITEMS` array. Only fields we actually use. */
export type RawDeparture = {
  SCHED_DEP_DATE: string;
  DESTINATION: string;
  TRACK: string;
  LINE: string;
  LINECODE: string;
  LINEABBREVIATION: string;
  TRAIN_ID: string;
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

export type Departure = {
  /** Stable identity across refreshes, so the list can update in place. */
  id: string;
  destination: string;
  /** ISO 8601, so the client can render in the viewer's timezone. */
  scheduledTime: string;
  /** When the train should actually leave: scheduled time plus any delay. */
  expectedTime: string;
  trainNumber: string;
  line: string;
  lineCode: string;
  /** Public-facing track, already translated. Empty until NJT assigns one. */
  track: string;
  status: DepartureStatus;
  /** NJT's own wording, e.g. "in 13 Min" — shown verbatim when useful. */
  statusText: string;
  delayMinutes: number;
};

/**
 * Line codes we never show. The user rides NJT rail only, and the real-time
 * departures endpoint has no server-side filter for this (unlike
 * getStationSchedule's NJTOnly parameter), so we drop them here.
 */
const EXCLUDED_LINE_CODES = new Set(["AM", "SP"]);
const EXCLUDED_LINE_ABBREVIATIONS = new Set(["AMTK", "SEPTA"]);

/**
 * Train ID prefixes, per Appendix I of the RailData API manual:
 *   A = Amtrak, S = SEPTA, X = non-revenue (carries no passengers).
 */
const EXCLUDED_TRAIN_PREFIXES = /^[ASX]/i;

/**
 * Railroad track -> the track riders actually see on station signage, per
 * Appendix II. Keyed by station code. Without this, Newark Airport would show
 * track "0" instead of "A".
 */
const TRACK_TRANSLATIONS: Record<string, Record<string, string>> = {
  NA: { "0": "A" }, // Newark Airport
  TS: { "1": "G", "2": "F", "3": "H", "4": "E" }, // Secaucus Lower Lvl
  MP: { "2": "1" }, // Metropark
  ON: { Single: "1" }, // Lebanon
  UV: { B: "2", Single: "1" }, // Montclair State U
  ST: { Single: "S" }, // Summit
};

export function translateTrack(stationCode: string, track: string): string {
  const trimmed = (track ?? "").trim();
  if (!trimmed) return "";
  return TRACK_TRANSLATIONS[stationCode.toUpperCase()]?.[trimmed] ?? trimmed;
}

/** True for trains this board should never show. */
export function isExcluded(item: RawDeparture): boolean {
  return (
    EXCLUDED_LINE_CODES.has((item.LINECODE ?? "").toUpperCase()) ||
    EXCLUDED_LINE_ABBREVIATIONS.has(
      (item.LINEABBREVIATION ?? "").toUpperCase(),
    ) ||
    EXCLUDED_TRAIN_PREFIXES.test((item.TRAIN_ID ?? "").trim())
  );
}

/**
 * Parses NJT's "30-May-2024 11:56:00 AM" timestamps. These carry no timezone
 * and are always America/New_York, which is also the timezone of everyone
 * using this board, so they are interpreted in the server's local zone.
 */
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

  const date = new Date(
    Number(year), month, Number(day), hour, Number(minute), Number(second),
  );
  return Number.isNaN(date.getTime()) ? null : date;
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

export function normalizeDeparture(
  item: RawDeparture,
  stationCode: string,
): Departure | null {
  const scheduled = parseNjtDate(item.SCHED_DEP_DATE);
  if (!scheduled) return null;

  const secondsLate = Number.parseInt(item.SEC_LATE ?? "0", 10);
  const delayMinutes = Number.isFinite(secondsLate)
    ? Math.max(0, Math.round(secondsLate / 60))
    : 0;
  const statusText = (item.STATUS ?? "").trim();
  const expected = new Date(scheduled.getTime() + delayMinutes * 60_000);

  return {
    id: `${item.TRAIN_ID}-${scheduled.toISOString()}`,
    destination: (item.DESTINATION ?? "").trim(),
    scheduledTime: scheduled.toISOString(),
    expectedTime: expected.toISOString(),
    trainNumber: (item.TRAIN_ID ?? "").trim(),
    line: (item.LINE ?? "").trim(),
    lineCode: (item.LINECODE ?? "").trim().toUpperCase(),
    track: translateTrack(stationCode, item.TRACK),
    status: toStatus(statusText, delayMinutes),
    statusText,
    delayMinutes,
  };
}

/**
 * Filters out non-NJT trains and normalizes the rest.
 *
 * Ordered by when each train will actually leave rather than by its timetable
 * slot, so the countdown column reads straight down and a badly delayed train
 * does not sit above one that will depart sooner.
 */
export function normalizeDepartures(
  items: RawDeparture[],
  stationCode: string,
): Departure[] {
  return items
    .filter((item) => !isExcluded(item))
    .map((item) => normalizeDeparture(item, stationCode))
    .filter((d): d is Departure => d !== null)
    .sort((a, b) => a.expectedTime.localeCompare(b.expectedTime));
}
