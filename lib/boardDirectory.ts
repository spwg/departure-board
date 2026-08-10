import {
  boardChoiceKey,
  njtBoardChoice,
  subwayBoardChoice,
  type BoardChoice,
} from "./boardChoices";
import { INTERCHANGES, interchangeHref } from "./interchanges";
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
  /** Set when this board is one provider-owned node in an Interchange. */
  interchangeId?: string;
  interchangeNodeId?: string;
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
  ...subway.listings,
];

/**
 * Replaces provider listings that belong to an Interchange with one listing
 * per transfer node. A node is deliberately narrower than a provider system:
 * at Penn, 1/2/3 and A/C/E are separate Subway choices.
 *
 * At Penn, MTA publishes 34 St-Penn Station as separate provider stations and
 * the rider recognises one place with several transfer targets. So Home offers
 * one Penn choice per node, while the provider stations behind them stay
 * distinct.
 */
function applyInterchanges(listings: BoardListing[]): {
  listings: BoardListing[];
  /** Where provider identities folded into a node now resolve to. */
  redirects: Map<string, BoardListing>;
} {
  const folded: BoardListing[] = [];
  const foldedMembers = new Set<BoardListing>();
  const redirects = new Map<string, BoardListing>();

  for (const interchange of INTERCHANGES) {
    for (const node of interchange.nodes) {
      const members = listings.filter((listing) =>
        node.stationIds.some(
          (stationId) => memberListing(listing, node.system, stationId),
        ),
      );
      if (members.length === 0) continue;
      const choice = node.system === "njt"
        ? njtBoardChoice(node.stationIds[0]!)
        : subwayBoardChoice(node.stationIds[0]!);
      const listing: BoardListing = {
        choice,
        name: interchange.name,
        alsoKnownAs: [
          ...new Set(members.flatMap((member) => [member.name, ...member.alsoKnownAs])),
        ].filter((name) => name !== interchange.name),
        system: node.system === "njt" ? "NJT" : "Subway",
        href: interchangeHref(interchange, node),
        routes: node.routes.length > 0
          ? node.routes
          : [...new Set(members.flatMap((member) => member.routes))],
        latitude: interchange.latitude,
        longitude: interchange.longitude,
        interchangeId: interchange.id,
        interchangeNodeId: node.id,
      };
      folded.push(listing);
      for (const member of members) foldedMembers.add(member);
      for (const stationId of node.stationIds) {
        const nodeChoice = node.system === "njt"
          ? njtBoardChoice(stationId)
          : subwayBoardChoice(stationId);
        redirects.set(boardChoiceKey(nodeChoice), listing);
      }
    }
  }

  return {
    listings: [...listings.filter((listing) => !foldedMembers.has(listing)), ...folded],
    redirects,
  };
}

/** True when `listing` is the board that `stationId` in `system` opens. */
function memberListing(
  listing: BoardListing,
  system: BoardChoice["system"],
  stationId: string,
): boolean {
  if (listing.choice.system !== system) return false;
  if (system === "njt") return listing.choice.stationId === stationId;
  return subway.byMember.get(boardChoiceKey(subwayBoardChoice(stationId))) === listing;
}

const interchanged = applyInterchanges(ungrouped);

/** Every board choice in both systems, ordered by name. */
export const boardListings: BoardListing[] = [...interchanged.listings]
  .sort((a, b) => a.name.localeCompare(b.name) || a.system.localeCompare(b.system));

/** Follows a provider identity to the node listing that replaced it. */
const resolve = (choice: BoardChoice, listing: BoardListing) =>
  interchanged.redirects.get(boardChoiceKey(choice)) ?? listing;

const KM_PER_MILE = 1.609344;
export const NEARBY_MAX_DISTANCE_KM = 2 * KM_PER_MILE;

export type NearbyBoardListing = {
  listing: BoardListing;
  distanceKm: number;
};


/**
 * Every provider identity that resolves to a board: a listing's own choice,
 * every MTA member of its complex, and every station an Interchange folded in.
 */
const byChoiceKey = new Map<string, BoardListing>([
  ...[...subway.byMember].map(([key, listing]) => [key, interchanged.redirects.get(key) ?? listing] as const),
  ...ungrouped.map((listing) => [boardChoiceKey(listing.choice), resolve(listing.choice, listing)] as const),
  ...boardListings.map((listing) => [boardChoiceKey(listing.choice), listing] as const),
]);

/** The other transfer nodes in the same Interchange, this one included. */
export function interchangeSiblings(listing: BoardListing): BoardListing[] {
  if (!listing.interchangeId) return [listing];
  return boardListings.filter((candidate) => candidate.interchangeId === listing.interchangeId);
}

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
