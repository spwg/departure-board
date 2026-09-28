import { parseNjtDate, type Departure, type TrainPosition } from "./departures";

/**
 * Train positions for New York Penn departures whose track is not posted yet.
 *
 * Penn posts tracks late on purpose, but the train is often already standing on
 * its platform. RailData's getVehicleData reports, by train number, the signal
 * track circuit each active train occupies (`ICS_TRACK_CKT`) and where that is
 * (`LATITUDE`/`LONGITUDE`). Riders never see the position itself; it is what
 * a predicted track is made from.
 *
 * Separately, every time a train standing in the station with a posted track
 * reports a circuit, the circuit/track pair is kept as position history. Any
 * circuit with history then gives an unposted train a predicted track, shown
 * with how confident that history makes it.
 *
 * Everything in this file is pure; storage and fetching live in
 * lib/pennCollect and lib/pennStore.
 */

/** A record from getVehicleData. Only fields we actually use. */
export type RawVehicle = {
  ID: string;
  ICS_TRACK_CKT: string;
  LATITUDE?: string;
  LONGITUDE?: string;
  LAST_MODIFIED?: string;
};

/** One train's latest reported position. */
export type VehicleReading = {
  circuit: string;
  atPenn: boolean;
  /** ISO 8601, or null when the feed gave no usable timestamp. */
  updatedAt: string | null;
};

/** circuit -> posted track -> times seen together. */
export type CircuitTable = Map<string, Map<string, number>>;

/** A train seen on a circuit while its posted track was known. */
export type CircuitObservation = {
  trainNumber: string;
  circuit: string;
  track: string;
  /** The departure's timetable time, ISO 8601. */
  scheduledTime: string;
};

/**
 * How a circuit's history becomes a confidence: Laplace's rule of succession,
 * (agreeing + 1) / (pairings + 2). Thin history reads as uncertain rather than
 * certain — one pairing is 67%, 3 of 3 is 80%, 20 of 20 is 95% — and one
 * dissenting pairing lowers it a little instead of switching it off. A platform
 * circuit sees only its own track and climbs; an approach circuit sees trains
 * bound for several platforms and stays low.
 */
export const CONFIDENCE_MODEL = "circuit-history-laplace-v1";

export function confidenceOf(agreeing: number, pairings: number): number {
  return (agreeing + 1) / (pairings + 2);
}

/** A confidence as riders see it: a whole percent, never a certain 100. */
export function confidencePercent(confidence: number): number {
  return Math.min(99, Math.round(confidence * 100));
}

/**
 * The New York Penn station box: the platforms run between Seventh and Ninth
 * Avenues, 31st to 33rd Street, padded slightly for the platform ends.
 */
const PENN_BOUNDS = {
  south: 40.7475,
  north: 40.7540,
  west: -74.0005,
  east: -73.9895,
};

export function isAtPenn(latitude: unknown, longitude: unknown): boolean {
  const lat = Number.parseFloat(String(latitude ?? ""));
  const lon = Number.parseFloat(String(longitude ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return (
    lat >= PENN_BOUNDS.south &&
    lat <= PENN_BOUNDS.north &&
    lon >= PENN_BOUNDS.west &&
    lon <= PENN_BOUNDS.east
  );
}

/**
 * The latest reading for each train number that reports a circuit. The feed
 * covers every train in the system; pass `only` to read just the ones that
 * matter — the board's — and skip parsing the rest's timestamps.
 */
export function readingsByTrain(
  vehicles: RawVehicle[],
  only?: ReadonlySet<string>,
): Map<string, VehicleReading> {
  const readings = new Map<string, VehicleReading>();
  for (const vehicle of vehicles) {
    const train = (vehicle?.ID ?? "").trim();
    const circuit = (vehicle?.ICS_TRACK_CKT ?? "").trim().toUpperCase();
    if (!train || !circuit || (only && !only.has(train))) continue;
    const updated = parseNjtDate(vehicle.LAST_MODIFIED ?? "");
    readings.set(train, {
      circuit,
      atPenn: isAtPenn(vehicle.LATITUDE, vehicle.LONGITUDE),
      updatedAt: updated ? updated.toISOString() : null,
    });
  }
  return readings;
}

/**
 * Circuit/track pairs to keep: trains with a posted track still standing in the
 * station. Circuits outside Penn — Secaucus, the tunnel — never predict a
 * platform and would only clutter the history.
 */
export function circuitObservations(
  departures: Departure[],
  readings: Map<string, VehicleReading>,
): CircuitObservation[] {
  const observations: CircuitObservation[] = [];
  for (const departure of departures) {
    if (!departure.track || departure.status === "departed") continue;
    const reading = readings.get(departure.trainNumber);
    if (reading?.atPenn) {
      observations.push({
        trainNumber: departure.trainNumber,
        circuit: reading.circuit,
        track: departure.track,
        scheduledTime: departure.scheduledTime,
      });
    }
  }
  return observations;
}

/** A circuit history's most likely track, and how confident it is (0–1). */
export type TrackPrediction = { track: string; confidence: number };

export type CircuitSummary = {
  circuit: string;
  total: number;
  /** Tracks this circuit preceded, most frequent first. */
  tracks: Array<{ track: string; count: number }>;
  /** The most frequent track, or null when the circuit has no history. */
  prediction: TrackPrediction | null;
};

export function summarizeCircuit(
  table: CircuitTable,
  circuit: string,
): CircuitSummary {
  const tracks = [...(table.get(circuit) ?? new Map<string, number>())]
    .map(([track, count]) => ({ track, count }))
    .sort((a, b) => b.count - a.count || a.track.localeCompare(b.track, undefined, { numeric: true }));
  const total = tracks.reduce((sum, { count }) => sum + count, 0);
  const top = tracks[0];
  const prediction = top
    ? { track: top.track, confidence: confidenceOf(top.count, total) }
    : null;
  return { circuit, total, tracks, prediction };
}

/** The track a circuit's history predicts, or null when it has none. */
export function predictTrack(table: CircuitTable, circuit: string): TrackPrediction | null {
  return summarizeCircuit(table, circuit).prediction;
}

/**
 * Adds `position` to departures NJT has not posted a track for yet whose train
 * reports one, with a predicted track whenever its circuit has history. Posted
 * tracks always win, and cancelled or departed trains get no position.
 */
export function withTrainPositions(
  departures: Departure[],
  readings: Map<string, VehicleReading>,
  table: CircuitTable,
): Departure[] {
  return departures.map((departure) => {
    if (
      departure.track ||
      departure.status === "cancelled" ||
      departure.status === "departed"
    ) {
      return departure;
    }
    const reading = readings.get(departure.trainNumber);
    if (!reading) return departure;

    const position: TrainPosition = { ...reading };
    const prediction = predictTrack(table, reading.circuit);
    if (prediction) {
      position.predictedTrack = prediction.track;
      position.confidence = prediction.confidence;
    }
    return { ...departure, position };
  });
}

/** Field separator for the stored "circuit<TAB>track" hash fields. */
const FIELD_SEPARATOR = "\t";

export function circuitField(circuit: string, track: string): string {
  return `${circuit}${FIELD_SEPARATOR}${track}`;
}

/** Builds a table from Redis HGETALL's flat [field, value, field, value, ...] reply. */
export function parseCircuitTable(flat: string[] | null | undefined): CircuitTable {
  const table: CircuitTable = new Map();
  const entries = Array.isArray(flat) ? flat : [];
  for (let i = 0; i + 1 < entries.length; i += 2) {
    const [circuit, track] = entries[i].split(FIELD_SEPARATOR);
    const count = Number.parseInt(entries[i + 1], 10);
    if (!circuit || !track || !Number.isFinite(count) || count <= 0) continue;
    addToTable(table, circuit, track, count);
  }
  return table;
}

export function addToTable(
  table: CircuitTable,
  circuit: string,
  track: string,
  count = 1,
): void {
  const counts = table.get(circuit) ?? new Map<string, number>();
  counts.set(track, (counts.get(track) ?? 0) + count);
  table.set(circuit, counts);
}
