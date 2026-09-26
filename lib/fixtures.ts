import { NJT_TIME_ZONE, type RawDeparture } from "./departures";
import { getStation } from "./stations";
import type { CircuitObservation, RawVehicle } from "./trainPositions";
import type { RawStop, RawStopList } from "./stops";


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

/**
 * Returns fresh raw API records relative to the current time. Station code is
 * case-insensitive; NY and NA receive their curated scenarios, while every
 * other code receives the generic scenario.
 */
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

/**
 * Station codes along each line, ordered outbound from New York. Only as much
 * of the real sequence as it takes to look like a railway — fixtures stand in
 * for the feed, they are not a timetable.
 */
const LINE_STOPS: Record<string, string[]> = {
  NE: ["NY", "SE", "NP", "NA", "EZ", "LI", "RH", "MP", "MU", "ED", "NB", "JA", "PJ", "HL", "TR"],
  NC: ["NY", "SE", "NP", "NA", "EZ", "LI", "RH", "WB", "PE", "CH", "AM", "HZ", "MI", "RB", "LS", "LB", "EL", "AH", "AP", "BB", "BS", "LA", "SQ", "PP", "BH"],
  ME: ["NY", "SE", "ND", "BU", "EO", "OG", "MT", "SO", "MW", "MB", "RT", "ST", "CM", "MA", "CN", "MR", "MX", "DV", "DO"],
  GS: ["NY", "SE", "ND", "BU", "EO", "OG", "MW", "MB", "RT", "ST", "NV", "MH", "BY", "GI", "SG", "GO", "LY", "BI", "BV", "FH", "PC", "GL"],
  MC: ["NY", "SE", "ND", "WT", "BM", "GG", "MC", "WG", "UM", "MS", "HS", "UV", "FA", "23", "MV", "LP", "TO", "BN", "ML", "DV", "DO", "OL", "NT", "HP", "HQ"],
};

/** Roughly how long the fixture train takes between stations. */
const MINUTES_BETWEEN_STOPS = 6;

/** How many trailing stops are left without an ETA. */
const STOPS_WITHOUT_ESTIMATE = 2;

function findTemplate(
  trainId: string,
): { template: Template; stationCode: string } | null {
  const wanted = trainId.trim().toUpperCase();
  const boards: Array<[string, Template[]]> = [
    ...Object.entries(BY_STATION),
    // The generic board stands in for every other station, so it has no code
    // of its own to anchor the stop list to.
    ["", GENERIC],
  ];

  for (const [stationCode, templates] of boards) {
    const template = templates.find(
      (t) => t.trainId.toUpperCase() === wanted,
    );
    if (template) return { template, stationCode };
  }
  return null;
}

/** The stations a fixture train calls at, in the order it calls at them. */
function routeFor(template: Template): string[] {
  const line = LINE_STOPS[template.lineCode] ?? LINE_STOPS.NE;

  const inbound =
    template.destination === "New York Penn Station" ||
    template.destination === "Hoboken";
  let route = inbound ? [...line].reverse() : [...line];

  // Hoboken trains terminate at the old ferry terminal rather than running
  // through Secaucus to New York.
  if (template.destination === "Hoboken") {
    route = [...route.filter((code) => code !== "SE" && code !== "NY"), "HB"];
  }

  // Everything past the destination belongs to a train that runs further down
  // the same line.
  const last = route.findIndex(
    (code) => getStation(code)?.name === template.destination,
  );
  return last === -1 ? route : route.slice(0, last + 1);
}

/**
 * A stand-in stop list, matched to the board that linked to it so the two
 * agree. The trailing stops are deliberately left without a time: NJT stops
 * estimating that far ahead, and the view has to render the gap.
 */
export function fixtureStopList(trainId: string): RawStopList {
  const found = findTemplate(trainId);
  if (!found) {
    return {
      TRAIN_ID: trainId,
      LINECODE: "",
      DESTINATION: "",
      TRANSFERAT: "",
      STOPS: [],
    };
  }

  const { template, stationCode } = found;
  const route = routeFor(template);
  const now = Date.now();

  // Where the board that linked here sits on the route. Stops before it have
  // already been served.
  const origin = Math.max(0, route.indexOf(stationCode));
  const lastEstimated = route.length - 1 - STOPS_WITHOUT_ESTIMATE;

  const stops: RawStop[] = route.map((code, index) => {
    const minutes =
      template.minutesFromNow + (index - origin) * MINUTES_BETWEEN_STOPS;

    return {
      STATION_2CHAR: code,
      STATIONNAME: getStation(code)?.name ?? code,
      TIME:
        index > lastEstimated && index > origin
          ? ""
          : njtDate(new Date(now + minutes * 60_000)),
      // Peak trains only pick up on the way out and only discharge at the end.
      PICKUP: index === origin + 1 ? "Pick Up Only" : "",
      DROPOFF: index === route.length - 1 ? "Discharge Only" : "",
      DEPARTED: index < origin ? "YES" : "NO",
      STOP_STATUS: "OnTime",
    };
  });

  return {
    TRAIN_ID: template.trainId,
    LINECODE: template.lineCode,
    DESTINATION: template.destination,
    // North Jersey Coast Line trains split at Long Branch.
    TRANSFERAT: template.destination === "Bay Head" ? "Long Branch" : "",
    STOPS: stops,
  };
}

/** Inside New York Penn's platform area, as the vehicle feed reports it. */
const AT_PENN = { LATITUDE: "40.750600", LONGITUDE: "-73.993500" };

/**
 * Stand-in getVehicleData records. The circuit names are made up — real ones
 * are whatever RailData reports — and chosen so the fixture NY board shows a
 * train at Penn whose circuit history names its platform (#6647), a train at
 * Penn on a circuit with no settled history (#3251), and a train still out on
 * the approach (#3863).
 */
export function fixtureVehicles(): RawVehicle[] {
  const updated = njtDate(new Date(Date.now() - 40_000));
  return [
    { ID: "3861", ICS_TRACK_CKT: "FIXTURE-PLATFORM-5", ...AT_PENN, LAST_MODIFIED: updated },
    { ID: "3247", ICS_TRACK_CKT: "FIXTURE-PLATFORM-7", ...AT_PENN, LAST_MODIFIED: updated },
    { ID: "6647", ICS_TRACK_CKT: "FIXTURE-PLATFORM-9", ...AT_PENN, LAST_MODIFIED: updated },
    { ID: "3251", ICS_TRACK_CKT: "FIXTURE-PLATFORM-2", ...AT_PENN, LAST_MODIFIED: updated },
    { ID: "3863", ICS_TRACK_CKT: "FIXTURE-APPROACH", LATITUDE: "40.745300", LONGITUDE: "-74.017900", LAST_MODIFIED: updated },
  ];
}

/** Stand-in position history matching `fixtureVehicles`, newest first. */
export function fixturePositionHistory(): CircuitObservation[] {
  const day = 24 * 60 * 60_000;
  const now = Date.now();
  const rows: Array<[string, string, string, number]> = [
    ["6647", "FIXTURE-PLATFORM-9", "9", 1],
    ["3861", "FIXTURE-PLATFORM-5", "5", 1],
    ["6647", "FIXTURE-PLATFORM-9", "9", 2],
    ["3863", "FIXTURE-APPROACH", "4", 2],
    ["6647", "FIXTURE-PLATFORM-9", "9", 3],
    ["3863", "FIXTURE-APPROACH", "3", 3],
    ["3251", "FIXTURE-PLATFORM-2", "2", 4],
    ["6647", "FIXTURE-PLATFORM-9", "9", 5],
  ];
  return rows.map(([trainNumber, circuit, track, daysAgo]) => ({
    trainNumber,
    circuit,
    track,
    scheduledTime: new Date(now - daysAgo * day).toISOString(),
  }));
}
