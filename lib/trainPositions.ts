import { parseNjtDate, type Departure, type TrainPosition } from "./departures";

/**
 * Train positions for New York Penn departures whose track is not posted yet.
 *
 * Penn posts tracks late on purpose, but the train is often already standing on
 * its platform. RailData's getVehicleData reports, by train number, the signal
 * track circuit each active train occupies (`ICS_TRACK_CKT`) and where that is
 * (`LATITUDE`/`LONGITUDE`). The board shows that raw position directly — no
 * history needed — labelled as a position, never as a track.
 *
 * Separately, every time a train with a posted track reports a circuit, the
 * circuit/track pair is kept as position history. A circuit whose history
 * agrees on one track is then also shown as that platform.
 *
 * Everything in this file is pure; storage and fetching live in
 * lib/pennPositions and lib/pennPositionStore.
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
 * How much agreement a circuit's history needs before it names a platform. A
 * circuit on an approach track sees trains bound for several platforms and so
 * never qualifies; a platform circuit sees only its own track.
 */
export const MIN_SAMPLES = 3;
export const MIN_AGREEMENT = 0.95;

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

/** The latest reading for each train number that reports a circuit. */
export function readingsByTrain(vehicles: RawVehicle[]): Map<string, VehicleReading> {
  const readings = new Map<string, VehicleReading>();
  for (const vehicle of vehicles) {
    const train = (vehicle?.ID ?? "").trim();
    const circuit = (vehicle?.ICS_TRACK_CKT ?? "").trim().toUpperCase();
    if (!train || !circuit) continue;
    const updated = parseNjtDate(vehicle.LAST_MODIFIED ?? "");
    readings.set(train, {
      circuit,
      atPenn: isAtPenn(vehicle.LATITUDE, vehicle.LONGITUDE),
      updatedAt: updated ? updated.toISOString() : null,
    });
  }
  return readings;
}

/** Circuit/track pairs to keep: trains with a posted track that are still in the station. */
export function circuitObservations(
  departures: Departure[],
  readings: Map<string, VehicleReading>,
): CircuitObservation[] {
  const observations: CircuitObservation[] = [];
  for (const departure of departures) {
    if (!departure.track || departure.status === "departed") continue;
    const reading = readings.get(departure.trainNumber);
    if (reading) {
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

/** One circuit/track pairing as kept in position history. */
export type PositionEvent = CircuitObservation & {
  /** When the pairing was recorded, ISO 8601. */
  recordedAt: string;
};

export type CircuitSummary = {
  circuit: string;
  total: number;
  /** Tracks this circuit preceded, most frequent first. */
  tracks: Array<{ track: string; count: number }>;
  /** The platform the history agrees on, or null while it is thin or split. */
  platform: string | null;
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
  const platform =
    top && total >= MIN_SAMPLES && top.count / total >= MIN_AGREEMENT
      ? top.track
      : null;
  return { circuit, total, tracks, platform };
}

/** The platform a circuit's history reliably names, or null. */
export function trackForCircuit(table: CircuitTable, circuit: string): string | null {
  return summarizeCircuit(table, circuit).platform;
}

/**
 * Adds `position` to departures NJT has not posted a track for yet whose train
 * reports one. Posted tracks always win, and cancelled or departed trains get
 * no position.
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
    const historyTrack = trackForCircuit(table, reading.circuit);
    if (historyTrack) position.historyTrack = historyTrack;
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
