import {
  boardChoiceKey,
  njtBoardChoice,
  subwayBoardChoice,
  type BoardChoice,
} from "./boardChoices";
import { distanceKm, normalizeStationName, stations } from "./stations";
import { SUBWAY_STATIONS, type SubwayStation } from "./subway";

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
  /**
   * MTA's other published names for the same complex. A rider who knows the
   * place as "World Trade Center" should find it even though the complex's
   * board is titled "Park Place".
   */
  alsoKnownAs: string[];
  system: "NJT" | "Subway";
  href: string;
  /** NJT line codes or MTA route ids — never translated between the two. */
  routes: string[];
  latitude: number;
  longitude: number;
};

/**
 * Picks the member whose name should title a complex: the name the most
 * members publish, then the member serving the most routes, then the lowest
 * provider id. Every complex has exactly one, deterministically.
 */
function representative(members: SubwayStation[]): SubwayStation {
  const nameCounts = new Map<string, number>();
  for (const member of members) {
    nameCounts.set(member.name, (nameCounts.get(member.name) ?? 0) + 1);
  }
  return [...members].sort((a, b) =>
    (nameCounts.get(b.name)! - nameCounts.get(a.name)!) ||
    (b.routes.length - a.routes.length) ||
    a.id.localeCompare(b.id),
  )[0]!;
}

/**
 * One listing per MTA complex, not per member station: a complex's members
 * share a board, so offering the rider four ways into 4 different names for
 * the same platforms would be four ways into the same page. The names of the
 * members that did not win the title are kept as search aliases instead.
 */
function subwayListings(): { listings: BoardListing[]; byMember: Map<string, BoardListing> } {
  const complexes = new Map<string, SubwayStation[]>();
  for (const station of SUBWAY_STATIONS) {
    const members = complexes.get(station.complexId);
    if (members) members.push(station);
    else complexes.set(station.complexId, [station]);
  }

  const listings: BoardListing[] = [];
  const byMember = new Map<string, BoardListing>();
  for (const members of complexes.values()) {
    const head = representative(members);
    const ordered = [...members].sort((a, b) => a.id.localeCompare(b.id));
    const listing: BoardListing = {
      choice: subwayBoardChoice(head.id),
      name: head.name,
      alsoKnownAs: [...new Set(ordered.map((member) => member.name))].filter(
        (name) => name !== head.name,
      ),
      system: "Subway",
      href: `/subway/station/${head.id}`,
      routes: [...new Set(ordered.flatMap((member) => member.routes))],
      latitude: head.latitude,
      longitude: head.longitude,
    };
    listings.push(listing);
    for (const member of members) {
      byMember.set(boardChoiceKey(subwayBoardChoice(member.id)), listing);
    }
  }
  return { listings, byMember };
}

const subway = subwayListings();

/** Every board choice in both systems, ordered by name. */
export const boardListings: BoardListing[] = [
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
  ...subway.listings,
].sort((a, b) => a.name.localeCompare(b.name) || a.system.localeCompare(b.system));

const byChoiceKey = new Map<string, BoardListing>([
  ...boardListings.map((listing) => [boardChoiceKey(listing.choice), listing] as const),
  ...subway.byMember,
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
 * break by name so results are stable, and an empty query returns nothing.
 */
export function searchBoardListings(query: string, limit = 40): BoardListing[] {
  const q = normalizeStationName(query);
  if (!q) return [];

  return boardListings
    .map((listing) => ({ listing, score: score(listing, q) }))
    .filter((scored) => scored.score !== Infinity)
    .sort((a, b) => a.score - b.score || a.listing.name.localeCompare(b.listing.name))
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
