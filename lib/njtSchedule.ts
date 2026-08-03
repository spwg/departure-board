import type { RawDeparture } from "./departures";

/** One scheduled station call from NJ TRANSIT's daily station schedule. */
export type RawStationScheduleDeparture = {
  SCHED_DEP_DATE: string;
  TRAIN_ID: string;
  DIRECTION: string;
  /** NJT's permanent through-service/connection identity, when it has one. */
  PERM_CONNECTING_TRAIN_ID: string;
};

export type NjtDirection = "Eastbound" | "Westbound";

function identity(value: string | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function identities(values: Array<string | undefined>): Set<string> {
  return new Set(values.map(identity).filter((value): value is string => value !== null));
}

function officialDirection(value: string): NjtDirection | undefined {
  const normalized = value.trim();
  return normalized === "Eastbound" || normalized === "Westbound"
    ? normalized
    : undefined;
}

/**
 * Returns the schedule's direction only when it identifies the exact live
 * station call. A train number is reused every day, so the provider's
 * scheduled departure value is part of the identity. NJCL through-service can
 * expose either side of its permanent connection as the live identity, hence
 * both provider identity fields participate in the match.
 */
export function directionForDeparture(
  departure: RawDeparture,
  schedule: RawStationScheduleDeparture[],
): NjtDirection | undefined {
  const callTime = departure.SCHED_DEP_DATE?.trim();
  if (!callTime) return undefined;

  const liveIdentities = identities([
    departure.TRAIN_ID,
    departure.CONNECTING_TRAIN_ID,
  ]);
  if (liveIdentities.size === 0) return undefined;

  const matches = new Set<NjtDirection>();
  for (const scheduled of schedule) {
    if (scheduled.SCHED_DEP_DATE?.trim() !== callTime) continue;
    const scheduleIdentities = identities([
      scheduled.TRAIN_ID,
      scheduled.PERM_CONNECTING_TRAIN_ID,
    ]);
    if (![...liveIdentities].some((value) => scheduleIdentities.has(value))) {
      continue;
    }
    const direction = officialDirection(scheduled.DIRECTION ?? "");
    if (direction) matches.add(direction);
  }

  // Ambiguous enrichment is deliberately no enrichment: a neutral row is
  // more honest than assigning one train to both opposing groups.
  return matches.size === 1 ? [...matches][0] : undefined;
}
