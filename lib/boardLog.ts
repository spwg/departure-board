import { NJT_TIME_ZONE, type Departure } from "./departures";
import {
  CONFIDENCE_MODEL,
  confidencePercent,
  summarizeCircuit,
  type CircuitTable,
  type VehicleReading,
} from "./trainPositions";

/**
 * The New York Penn board log: a timestamped record of what the board showed
 * for every train, kept so predicted tracks can be scored against the tracks
 * NJ Transit later posts (scripts/penn-accuracy.mts).
 *
 * A train's full snapshot is logged when it first appears, then only what can
 * change whenever something a rider could see does, then a "gone" entry when
 * it leaves the board. Every fresh board load is also counted per minute, so
 * gaps in collection show. Everything here is pure; storage lives in
 * lib/boardLogStore.
 */

/** Bumped whenever a logged field changes meaning. */
export const BOARD_LOG_VERSION = 1;

/** What loaded the board: the always-on collector, or a rider's view. */
export type BoardLogSource = "collector" | "board";

export type TrainSnapshot = {
  /** Train number and timetable time: one train on one day. */
  id: string;
  trainNumber: string;
  line: string;
  lineCode: string;
  destination: string;
  scheduledTime: string;
  expectedTime: string;
  delayMinutes: number;
  status: Departure["status"];
  statusText: string;
  /** The track NJ Transit posted, or null while none is. */
  postedTrack: string | null;
  /** The vehicle feed's reading for this train, whether or not it is shown. */
  circuit: string | null;
  atPenn: boolean | null;
  positionUpdatedAt: string | null;
  /** The track the board showed, and whether posted or predicted. */
  shownTrack: string | null;
  shownTrackKind: "posted" | "predicted" | null;
  /** The confidence shown with a predicted track, as the whole percent riders saw. */
  shownConfidence: number | null;
  /** The circuit the board showed as the train's position, if any. */
  shownCircuit: string | null;
  /** The circuit's position history at the time, behind any prediction. */
  history: { pairings: number; topTrack: string | null; topCount: number } | null;
};

/** Fields fixed for a train's whole run, logged only in its first entry. */
const FIXED_FIELDS = ["trainNumber", "line", "lineCode", "destination", "scheduledTime"] as const;

/** A later entry for a train: its snapshot without the fields that never change. */
export type TrainChange = Omit<TrainSnapshot, (typeof FIXED_FIELDS)[number]>;

export type BoardLogEvent =
  | ({ kind: "first"; v: number; at: string; source: BoardLogSource; model: string } & TrainSnapshot)
  | ({ kind: "change"; v: number; at: string; source: BoardLogSource; model: string } & TrainChange)
  | { kind: "gone"; v: number; at: string; source: BoardLogSource; id: string };

export function trainId(departure: Pick<Departure, "trainNumber" | "scheduledTime">): string {
  return `${departure.trainNumber}|${departure.scheduledTime}`;
}

/** What the board showed for each train, with the readings and history behind it. */
export function boardSnapshots(
  departures: Departure[],
  readings: Map<string, VehicleReading>,
  table: CircuitTable,
): TrainSnapshot[] {
  return departures.map((departure) => {
    const reading = readings.get(departure.trainNumber);
    const predicted = departure.track ? null : (departure.position?.predictedTrack ?? null);
    const summary = reading ? summarizeCircuit(table, reading.circuit) : null;
    return {
      id: trainId(departure),
      trainNumber: departure.trainNumber,
      line: departure.line,
      lineCode: departure.lineCode,
      destination: departure.destination,
      scheduledTime: departure.scheduledTime,
      expectedTime: departure.expectedTime,
      delayMinutes: departure.delayMinutes,
      status: departure.status,
      statusText: departure.statusText,
      postedTrack: departure.track || null,
      circuit: reading?.circuit ?? null,
      atPenn: reading?.atPenn ?? null,
      positionUpdatedAt: reading?.updatedAt ?? null,
      shownTrack: departure.track || predicted,
      shownTrackKind: departure.track ? "posted" : predicted ? "predicted" : null,
      shownConfidence:
        predicted && departure.position?.confidence !== undefined
          ? confidencePercent(departure.position.confidence)
          : null,
      shownCircuit: departure.position?.circuit ?? null,
      history: summary
        ? {
            pairings: summary.total,
            topTrack: summary.tracks[0]?.track ?? null,
            topCount: summary.tracks[0]?.count ?? 0,
          }
        : null,
    };
  });
}

/**
 * The part of a snapshot whose change is worth a log entry. The feed's
 * timestamp and the history counts move on nearly every poll without anything
 * on the board changing, and a train running outside Penn changes circuit
 * nearly every poll too without bearing on a prediction, so these ride along
 * in entries but never cause one.
 */
export function changeKey(snapshot: TrainSnapshot): string {
  const inPenn = snapshot.atPenn === true;
  return JSON.stringify({
    ...snapshot,
    positionUpdatedAt: undefined,
    history: undefined,
    circuit: inPenn ? snapshot.circuit : undefined,
    shownCircuit: inPenn ? snapshot.shownCircuit : undefined,
  });
}

/** A train's first entry, carrying everything about it. */
export function firstEvent(at: string, source: BoardLogSource, snapshot: TrainSnapshot): BoardLogEvent {
  return { kind: "first", v: BOARD_LOG_VERSION, at, source, model: CONFIDENCE_MODEL, ...snapshot };
}

/** A later entry: the snapshot less its fixed fields, which the first entry has. */
export function changeEvent(at: string, source: BoardLogSource, snapshot: TrainSnapshot): BoardLogEvent {
  const change: Partial<TrainSnapshot> = { ...snapshot };
  for (const field of FIXED_FIELDS) delete change[field];
  return { kind: "change", v: BOARD_LOG_VERSION, at, source, model: CONFIDENCE_MODEL, ...(change as TrainChange) };
}

/** The Eastern minute of the day, 0–1439, a poll is counted under. */
export function logMinute(at: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NJT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

/** The Eastern date an entry is filed under, YYYY-MM-DD. */
export function logDay(at: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NJT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}
