import { NJT_TIME_ZONE, type RawDeparture } from "./departures";

/**
 * Stand-in departure data used when no API credentials are configured, so the
 * app is runnable without them.
 *
 * These are raw API-shaped records rather than ready-made `Departure` objects,
 * deliberately: fixture runs then exercise the same parsing, filtering, and
 * track-translation code as live data. The set includes Amtrak and non-revenue
 * trains so the exclusion rules are genuinely tested, and a Newark Airport
 * track of "0" so the translation to "A" is visible.
 */

/**
 * Formats a Date the way the API does: "30-May-2024 11:56:00 AM".
 *
 * Rendered in Eastern time like the real feed, not the server's zone, so
 * fixtures exercise the same timezone handling as live data instead of
 * round-tripping through whatever zone the host runs in.
 */
function njtDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NJT_TIME_ZONE,
    hour12: true,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const field: Record<string, string> = {};
  for (const part of parts) field[part.type] = part.value;

  return (
    `${field.day}-${field.month}-${field.year} ` +
    `${field.hour}:${field.minute}:${field.second} ${field.dayPeriod}`
  );
}

type Template = {
  minutesFromNow: number;
  destination: string;
  line: string;
  lineCode: string;
  lineAbbreviation: string;
  trainId: string;
  track: string;
  status: string;
  secondsLate?: number;
};

const NY_PENN: Template[] = [
  { minutesFromNow: 3, destination: "Trenton", line: "Northeast Corridor Line", lineCode: "NE", lineAbbreviation: "NEC", trainId: "3861", track: "5", status: "ALL ABOARD" },
  { minutesFromNow: 7, destination: "Long Branch", line: "North Jersey Coast Line", lineCode: "NC", lineAbbreviation: "NJCL", trainId: "3247", track: "7", status: "in 7 Min" },
  { minutesFromNow: 11, destination: "Dover", line: "Morris & Essex Line", lineCode: "ME", lineAbbreviation: "M&E", trainId: "6647", track: "", status: "in 11 Min" },
  // Amtrak — must never reach the board.
  { minutesFromNow: 13, destination: "Washington", line: "REGIONAL", lineCode: "AM", lineAbbreviation: "AMTK", trainId: "A187", track: "11", status: "in 13 Min" },
  { minutesFromNow: 16, destination: "Trenton", line: "Northeast Corridor Line", lineCode: "NE", lineAbbreviation: "NEC", trainId: "3863", track: "", status: "12 Min Late", secondsLate: 740 },
  { minutesFromNow: 21, destination: "Bay Head", line: "North Jersey Coast Line", lineCode: "NC", lineAbbreviation: "NJCL", trainId: "3251", track: "", status: "in 21 Min" },
  { minutesFromNow: 24, destination: "Hackettstown", line: "Montclair-Boonton Line", lineCode: "MC", lineAbbreviation: "MOBO", trainId: "1023", track: "", status: "in 24 Min" },
  // Non-revenue equipment move — must never reach the board.
  { minutesFromNow: 27, destination: "Sunnyside Yard", line: "Northeast Corridor Line", lineCode: "NE", lineAbbreviation: "NEC", trainId: "X902", track: "", status: "in 27 Min" },
  { minutesFromNow: 31, destination: "Gladstone", line: "Gladstone Branch", lineCode: "GS", lineAbbreviation: "M&E", trainId: "6653", track: "", status: "in 31 Min" },
  { minutesFromNow: 34, destination: "Jersey Avenue", line: "Northeast Corridor Line", lineCode: "NE", lineAbbreviation: "NEC", trainId: "3867", track: "", status: "CANCELLED" },
  { minutesFromNow: 39, destination: "Dover", line: "Morris & Essex Line", lineCode: "ME", lineAbbreviation: "M&E", trainId: "6655", track: "", status: "in 39 Min" },
  { minutesFromNow: 46, destination: "Long Branch", line: "North Jersey Coast Line", lineCode: "NC", lineAbbreviation: "NJCL", trainId: "3255", track: "", status: "in 46 Min", secondsLate: 180 },
  { minutesFromNow: 52, destination: "Trenton", line: "Northeast Corridor Line", lineCode: "NE", lineAbbreviation: "NEC", trainId: "3869", track: "", status: "in 52 Min" },
];

const NEWARK_AIRPORT: Template[] = [
  // Railroad track "0" here, which must display as "A".
  { minutesFromNow: 4, destination: "New York Penn Station", line: "Northeast Corridor Line", lineCode: "NE", lineAbbreviation: "NEC", trainId: "3840", track: "0", status: "in 4 Min" },
  { minutesFromNow: 9, destination: "New York Penn Station", line: "North Jersey Coast Line", lineCode: "NC", lineAbbreviation: "NJCL", trainId: "3242", track: "0", status: "in 9 Min" },
  { minutesFromNow: 14, destination: "Springfield", line: "REGIONAL", lineCode: "AM", lineAbbreviation: "AMTK", trainId: "A140", track: "1", status: "in 14 Min" },
  { minutesFromNow: 18, destination: "Trenton", line: "Northeast Corridor Line", lineCode: "NE", lineAbbreviation: "NEC", trainId: "3851", track: "5", status: "8 Min Late", secondsLate: 505 },
  { minutesFromNow: 26, destination: "New York Penn Station", line: "Northeast Corridor Line", lineCode: "NE", lineAbbreviation: "NEC", trainId: "3842", track: "", status: "in 26 Min" },
  { minutesFromNow: 33, destination: "Long Branch", line: "North Jersey Coast Line", lineCode: "NC", lineAbbreviation: "NJCL", trainId: "3249", track: "", status: "in 33 Min" },
];

const GENERIC: Template[] = [
  { minutesFromNow: 6, destination: "New York Penn Station", line: "Northeast Corridor Line", lineCode: "NE", lineAbbreviation: "NEC", trainId: "3830", track: "2", status: "in 6 Min" },
  { minutesFromNow: 19, destination: "Hoboken", line: "Morris & Essex Line", lineCode: "ME", lineAbbreviation: "M&E", trainId: "6620", track: "", status: "in 19 Min" },
  { minutesFromNow: 28, destination: "New York Penn Station", line: "Northeast Corridor Line", lineCode: "NE", lineAbbreviation: "NEC", trainId: "3832", track: "", status: "4 Min Late", secondsLate: 265 },
  { minutesFromNow: 44, destination: "Trenton", line: "Northeast Corridor Line", lineCode: "NE", lineAbbreviation: "NEC", trainId: "3834", track: "", status: "in 44 Min" },
];

const BY_STATION: Record<string, Template[]> = {
  NY: NY_PENN,
  NA: NEWARK_AIRPORT,
};

export function fixtureDepartures(stationCode: string): RawDeparture[] {
  const templates = BY_STATION[stationCode.toUpperCase()] ?? GENERIC;
  const now = Date.now();

  return templates.map((t) => ({
    SCHED_DEP_DATE: njtDate(new Date(now + t.minutesFromNow * 60_000)),
    DESTINATION: t.destination,
    TRACK: t.track,
    LINE: t.line,
    LINECODE: t.lineCode,
    LINEABBREVIATION: t.lineAbbreviation,
    TRAIN_ID: t.trainId,
    STATUS: t.status,
    SEC_LATE: String(t.secondsLate ?? 0),
    INLINEMSG: "",
  }));
}
