/** A provider-owned system that can expose a departure board. */
export type TransitSystem = "njt" | "subway";

/**
 * A rider's selection of one provider's station board.
 *
 * `stationId` deliberately remains provider-native: NJT's two-character
 * station code is not interchangeable with an MTA station identifier.
 */
export type BoardChoice = {
  system: TransitSystem;
  stationId: string;
};

const SYSTEMS = new Set<TransitSystem>(["njt", "subway"]);

function normalizedStationId(system: TransitSystem, stationId: string): string {
  const trimmed = stationId.trim();
  return system === "njt" ? trimmed.toUpperCase() : trimmed;
}

/** Creates an NJT Rail board choice from its provider station code. */
export function njtBoardChoice(stationId: string): BoardChoice {
  return { system: "njt", stationId: normalizedStationId("njt", stationId) };
}

/** Accepts the temporary NJT-only caller format at the application boundary. */
export function normalizeBoardChoice(choice: BoardChoice | string): BoardChoice {
  return typeof choice === "string" ? njtBoardChoice(choice) : choice;
}

/** Stable local-storage identity for one provider-qualified board choice. */
export function boardChoiceKey({ system, stationId }: BoardChoice): string {
  return `${system}:${normalizedStationId(system, stationId)}`;
}

/**
 * Reads a persisted choice. Plain strings are the app's pre-Subway NJT
 * format, so they remain valid and migrate in memory without losing history.
 */
export function parseBoardChoice(value: unknown): BoardChoice | null {
  if (typeof value !== "string") return null;

  const separator = value.indexOf(":");
  if (separator === -1) {
    const stationId = normalizedStationId("njt", value);
    return stationId ? { system: "njt", stationId } : null;
  }

  const system = value.slice(0, separator) as TransitSystem;
  const stationId = normalizedStationId(system, value.slice(separator + 1));
  return SYSTEMS.has(system) && stationId ? { system, stationId } : null;
}

/** Narrows a board choice to the NJT station directory available today. */
export function isNjtBoardChoice(choice: BoardChoice): boolean {
  return choice.system === "njt";
}
