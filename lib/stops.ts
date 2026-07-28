/**
 * Turns NJ Transit's raw stop-list records into the shape the stops view
 * renders, the way lib/departures does for the board.
 *
 * The board and the stop list come from two different endpoints:
 * getTrainSchedule19Rec carries no stop information at all — the API manual is
 * explicit that its data is "much the same as DepartureVision, but without
 * train stop list information" — so the stops for a train have to be asked for
 * separately, by train number.
 */

import { decodeEntities, parseNjtDate } from "./departures";

/** A record from the API's `STOPS` array. Only fields we actually use. */
export type RawStop = {
  STATION_2CHAR: string;
  STATIONNAME: string;
  TIME: string;
  PICKUP: string;
  DROPOFF: string;
  DEPARTED: string;
  STOP_STATUS: string;
};

/** The getTrainStopList response. */
export type RawStopList = {
  TRAIN_ID: string;
  LINECODE: string;
  DESTINATION: string;
  TRANSFERAT: string;
  STOPS: RawStop[];
};

export type Stop = {
  /**
   * STATION_2CHAR. Trains that run through to other railroads stop at places
   * outside NJ Transit's own station list, so this does not always resolve via
   * lib/stations — callers must handle a miss.
   */
  code: string;
  name: string;
  /**
   * ISO 8601, or null when NJT has no estimate for this stop yet.
   *
   * This is an ETA, not a timetable time: the API manual defines the field as
   * "Estimated Time of Arrival (ETA) at the stop". Far enough down the line it
   * comes back empty, which is ordinary rather than an error.
   */
  time: string | null;
  departed: boolean;
  pickupOnly: boolean;
  dropoffOnly: boolean;
};

export type StopList = {
  trainNumber: string;
  lineCode: string;
  destination: string;
  /**
   * Where riders have to change to complete the trip — North Jersey Coast Line
   * trains split at Long Branch. Empty for everything else.
   */
  transferAt: string;
  stops: Stop[];
};

/**
 * The feed is inconsistent about booleans: DEPARTED arrives as "YES"/"NO",
 * while PICKUP and DROPOFF arrive as the phrases "Pick Up Only" and "Discharge
 * Only" on some records and as "true" on others. Anything unrecognised is
 * treated as false, so a wording change downgrades a note rather than
 * inventing one.
 */
function isAffirmative(value: string): boolean {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return false;
  return (
    text === "yes" ||
    text === "y" ||
    text === "true" ||
    text === "1" ||
    text.includes("only")
  );
}

export function normalizeStop(item: RawStop): Stop | null {
  const name = decodeEntities(item.STATIONNAME);
  // A stop with no name is nothing we can put on screen.
  if (!name) return null;

  const time = parseNjtDate(item.TIME);

  return {
    code: (item.STATION_2CHAR ?? "").trim().toUpperCase(),
    name,
    time: time ? time.toISOString() : null,
    departed: isAffirmative(item.DEPARTED),
    pickupOnly: isAffirmative(item.PICKUP),
    dropoffOnly: isAffirmative(item.DROPOFF),
  };
}

/**
 * Stops are left in the order NJT sends them, which is the order the train
 * calls at them. Unlike the board there is nothing sensible to sort by: the
 * later stops have no time to sort on.
 */
export function normalizeStopList(raw: RawStopList): StopList {
  const stops = Array.isArray(raw?.STOPS) ? raw.STOPS : [];

  return {
    trainNumber: (raw?.TRAIN_ID ?? "").trim(),
    lineCode: (raw?.LINECODE ?? "").trim().toUpperCase(),
    destination: decodeEntities(raw?.DESTINATION ?? ""),
    transferAt: decodeEntities(raw?.TRANSFERAT ?? ""),
    stops: stops
      .map((item) => normalizeStop(item))
      .filter((stop): stop is Stop => stop !== null),
  };
}
