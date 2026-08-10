import {
  boardChoiceKey,
  njtBoardChoice,
  subwayBoardChoice,
  type BoardChoice,
} from "./boardChoices";
import { distanceKm, normalizeStationName, stations } from "./stations";
import { SUBWAY_STATIONS } from "./subway";

/**
 * The one directory Home browses: every station board either system can open,
 * in a single shape.
 *
 * The two systems stay provider-owned underneath — an NJT two-character code
 * is not an MTA stop id, and `routes` holds each system's own symbols — but a
 * rider looking for a board should not have to choose a mode before searching.
 */
export type BoardListing = {
  choice: BoardChoice;
  /** The provider's own name for this board. */
  name: string;
  /** MTA's other published names for the same station complex. */
  alsoKnownAs: string[];
  system: "NJT" | "Subway";
  href: string;
  /** NJT line codes or MTA route ids — never translated between the two. */
  routes: string[];
  latitude: number;
  longitude: number;
};

/** One direct listing per provider-owned Subway station. */
const subwayListings: BoardListing[] = SUBWAY_STATIONS.map((station) => ({
  choice: subwayBoardChoice(station.id),
  name: station.name,
  alsoKnownAs: [...new Set(
    SUBWAY_STATIONS
      .filter((member) => member.complexId === station.complexId)
      .map((member) => member.name),
  )].filter((name) => name !== station.name),
  system: "Subway" as const,
  href: `/subway/station/${station.id}`,
  routes: station.routes,
  latitude: station.latitude,
  longitude: station.longitude,
}));

const ungrouped: BoardListing[] = [
  ...stations.map((station) => ({
    choice: njtBoardChoice(station.code),
    name: station.name,
    alsoKnownAs: [],
    system: "NJT" as const,
    href: `/station/${station.code}`,
    routes: station.lines,
    latitude: station.lat,
    longitude: station.lng,
  })),
  ...subwayListings,
];

/** Every board choice in both systems, ordered by name. */
export const boardListings: BoardListing[] = [...ungrouped]
  .sort((a, b) => a.name.localeCompare(b.name) || a.system.localeCompare(b.system));

const KM_PER_MILE = 1.609344;
export const NEARBY_MAX_DISTANCE_KM = 2 * KM_PER_MILE;

export type NearbyBoardListing = {
  listing: BoardListing;
  distanceKm: number;
};


/**
 * Every provider identity resolves directly to its own provider board.
 */
const byChoiceKey = new Map<string, BoardListing>([
  ...ungrouped.map((listing) => [boardChoiceKey(listing.choice), listing] as const),
  ...boardListings.map((listing) => [boardChoiceKey(listing.choice), listing] as const),
]);

/**
 * Resolves a saved choice to the board it opens — including an MTA complex
 * member saved before it was folded under its complex's title, and a bare NJT
 * code from before the app had two systems. A choice this build no longer
 * recognises resolves to null rather than throwing, so an old favourites list
 * never breaks Home.
 */
export function getBoardListing(choice: BoardChoice): BoardListing | null {
  return byChoiceKey.get(boardChoiceKey(choice)) ?? null;
}

/** Lower is better; Infinity means the listing does not match at all. */
function score(listing: BoardListing, query: string): number {
  if (listing.choice.stationId.toLowerCase() === query) return 0;
  let best = Infinity;
  for (const label of [listing.name, ...listing.alsoKnownAs]) {
    const name = normalizeStationName(label);
    if (name.startsWith(query)) best = Math.min(best, 1);
    else if (name.split(" ").some((word) => word.startsWith(query))) best = Math.min(best, 2);
    else if (name.includes(query)) best = Math.min(best, 3);
  }
  return best;
}

/**
 * Board choices from both systems in one ranked result set: exact provider id
 * first, then name-prefix, then word-prefix, then any containing match. Ties
 * prefer boards serving more routes, so larger stations appear first, and then
 * break by name so results are stable. An empty query returns nothing.
 */
export function searchBoardListings(query: string, limit = 40): BoardListing[] {
  const q = normalizeStationName(query);
  if (!q) return [];

  return boardListings
    .map((listing) => ({ listing, score: score(listing, q) }))
    .filter((scored) => scored.score !== Infinity)
    .sort((a, b) =>
      a.score - b.score ||
      b.listing.routes.length - a.listing.routes.length ||
      a.listing.name.localeCompare(b.listing.name) ||
      a.listing.system.localeCompare(b.listing.system),
    )
    .slice(0, limit)
    .map((scored) => scored.listing);
}

/**
 * The closest board in either system. Coordinates are compared directly rather
 * than one system being preferred, so standing in Penn Station's subway
 * mezzanine does not return the rail board on a tie-break of system order.
 */
export function nearestBoardListing(
  latitude: number,
  longitude: number,
): { listing: BoardListing; distanceKm: number } {
  let best = boardListings[0]!;
  let bestDistance = Infinity;
  for (const listing of boardListings) {
    const distance = distanceKm(latitude, longitude, listing.latitude, listing.longitude);
    if (distance < bestDistance) {
      best = listing;
      bestDistance = distance;
    }
  }
  return { listing: best, distanceKm: bestDistance };
}

/** Board choices within the nearby radius, ordered closest first. */
export function nearbyBoardListings(
  latitude: number,
  longitude: number,
  maxDistanceKm = NEARBY_MAX_DISTANCE_KM,
): NearbyBoardListing[] {
  return boardListings
    .map((listing) => ({
      listing,
      distanceKm: distanceKm(latitude, longitude, listing.latitude, listing.longitude),
    }))
    .filter(({ distanceKm: distance }) => distance <= maxDistanceKm)
    .sort((a, b) =>
      a.distanceKm - b.distanceKm ||
      a.listing.name.localeCompare(b.listing.name) ||
      a.listing.system.localeCompare(b.listing.system),
    );
}

/** The full directory grouped by first character, for alphabetical browsing. */
export function boardListingsByLetter(): [string, BoardListing[]][] {
  const groups = new Map<string, BoardListing[]>();
  for (const listing of boardListings) {
    const letter = listing.name[0]!.toUpperCase();
    const group = groups.get(letter);
    if (group) group.push(listing);
    else groups.set(letter, [listing]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
