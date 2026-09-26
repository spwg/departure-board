import type { Departure } from "./departures";

/**
 * Sighted tracks: the platform an NJ Transit train is already standing on at
 * New York Penn Station before NJ Transit posts its track.
 *
 * Penn posts tracks late on purpose, but the train is often on its platform
 * well before then. RailData's getVehicleData reports each active train's
 * `ICS_TRACK_CKT` — the signal track circuit it occupies — keyed by train
 * number. The feed says nothing about which circuits are platform tracks, so
 * the mapping is learned rather than hand-written: every time a train with a
 * posted track reports a circuit, that circuit/track pair is counted. A circuit
 * that has agreed with one track often enough is then trusted to name the
 * platform of a train whose track is not posted yet.
 *
 * Everything in this file is pure; storage and fetching live in
 * lib/pennSightings.
 */

/** A record from getVehicleData. Only fields we actually use. */
export type RawVehicle = {
  ID: string;
  ICS_TRACK_CKT: string;
};

/** circuit -> posted track -> times seen together. */
export type CircuitTable = Map<string, Map<string, number>>;

export type CircuitObservation = {
  trainNumber: string;
  circuit: string;
  track: string;
};

/**
 * How much agreement a circuit needs before it names a platform. A circuit on
 * an approach track sees trains bound for several platforms and so never
 * qualifies; a platform circuit sees only its own track.
 */
export const MIN_SAMPLES = 5;
export const MIN_AGREEMENT = 0.95;

/** The latest circuit reported for each train number. */
export function circuitsByTrain(vehicles: RawVehicle[]): Map<string, string> {
  const circuits = new Map<string, string>();
  for (const vehicle of vehicles) {
    const train = (vehicle?.ID ?? "").trim();
    const circuit = (vehicle?.ICS_TRACK_CKT ?? "").trim().toUpperCase();
    if (train && circuit) circuits.set(train, circuit);
  }
  return circuits;
}

/** Circuit/track pairs to learn from: trains with a posted track that are still in the station. */
export function circuitObservations(
  departures: Departure[],
  circuits: Map<string, string>,
): CircuitObservation[] {
  const observations: CircuitObservation[] = [];
  for (const departure of departures) {
    if (!departure.track || departure.status === "departed") continue;
    const circuit = circuits.get(departure.trainNumber);
    if (circuit) {
      observations.push({
        trainNumber: departure.trainNumber,
        circuit,
        track: departure.track,
      });
    }
  }
  return observations;
}

/** The platform a circuit reliably belongs to, or null while the evidence is thin or split. */
export function trackForCircuit(
  table: CircuitTable,
  circuit: string,
): string | null {
  const counts = table.get(circuit);
  if (!counts) return null;

  let total = 0;
  let topTrack: string | null = null;
  let topCount = 0;
  for (const [track, count] of counts) {
    total += count;
    if (count > topCount) {
      topTrack = track;
      topCount = count;
    }
  }

  return total >= MIN_SAMPLES && topCount / total >= MIN_AGREEMENT
    ? topTrack
    : null;
}

/**
 * Adds `sightedTrack` to departures NJT has not posted a track for yet but
 * whose train already stands on a known platform circuit. Posted tracks always
 * win, and cancelled or departed trains are never sighted.
 */
export function withSightedTracks(
  departures: Departure[],
  circuits: Map<string, string>,
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
    const circuit = circuits.get(departure.trainNumber);
    const sightedTrack = circuit ? trackForCircuit(table, circuit) : null;
    return sightedTrack ? { ...departure, sightedTrack } : departure;
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
