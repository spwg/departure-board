import {
  boardChoiceKey,
  njtBoardChoice,
  subwayBoardChoice,
  type BoardChoice,
} from "./boardChoices";
import { distanceKm, normalizeStationName, stations } from "./stations";
import { SUBWAY_STATIONS } from "./subway";

/**
 * The one directory Home searches: every station board either system can open,
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

/**
 * Edit distance between `token` and the closest-matching prefix of `word`, so
 * a partly typed word is not penalised for the letters still to come.
 */
function prefixEditDistance(token: string, word: string): number {
  // Optimal-string-alignment table over token × word, so a swapped pair of
  // letters is one typo; the answer is the best cell in the last row, i.e.
  // `token` against any prefix of `word`.
  let before: number[] = [];
  let previous = Array.from({ length: word.length + 1 }, (_, index) => index);
  for (let i = 1; i <= token.length; i++) {
    const current = [i];
    for (let j = 1; j <= word.length; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (token[i - 1] === word[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && token[i - 1] === word[j - 2] && token[i - 2] === word[j - 1]) {
        current[j] = Math.min(current[j]!, before[j - 2]! + 1);
      }
    }
    before = previous;
    previous = current;
  }
  return Math.min(...previous);
}

/** Typos tolerated in one query word: none while it is short, more as it grows. */
function allowedTypos(token: string): number {
  if (token.length < 4) return 0;
  return token.length < 8 ? 1 : 2;
}

/** How well one query word matches a station name's words; lower is better. */
const WORD = 0;
const PREFIX = 1;
const INFIX = 2;
const FUZZY = 3;

type Match = {
  /** The weakest query word's match: a name is only as good as its worst word. */
  quality: number;
  /** Typos spent across the fuzzy query words. */
  typos: number;
};

/**
 * How `tokens` match one label, or null if some query word matches nothing.
 *
 * Each query word is graded against its best name word: the whole word
 * ("penn" in "New York Penn Station"), then the start of a word ("penn" in
 * "Pennsauken"), then inside a word ("field" in "Bloomfield"), then within a
 * few typos of a word's start ("colombus"). Words may come in any order.
 */
function matchLabel(tokens: string[], label: string): Match | null {
  const words = normalizeStationName(label).split(" ");
  let quality = WORD;
  let typos = 0;
  for (const token of tokens) {
    let best: number;
    if (words.includes(token)) best = WORD;
    else if (words.some((word) => word.startsWith(token))) best = PREFIX;
    // Inside-word matches need a few letters, or "e" would match everything.
    else if (token.length >= 3 && words.some((word) => word.includes(token))) best = INFIX;
    else {
      const distance = Math.min(...words.map((word) => prefixEditDistance(token, word)));
      if (distance > allowedTypos(token)) return null;
      best = FUZZY;
      typos += distance;
    }
    quality = Math.max(quality, best);
  }
  return { quality, typos };
}

/**
 * Lower is better, compared element by element; null means no match.
 *
 * A provider id typed exactly ("NY") wins outright. Otherwise whole-word
 * matches outrank word-start matches, which outrank inside-word and then
 * typo-tolerant matches, so "penn" finds the Penn Stations before Pennsauken.
 * Fewer typos rank higher, and a board's own name beats another name of its
 * complex, so "world trade" puts World Trade Center above its neighbours. The
 * caller breaks remaining ties by how many routes serve the board.
 */
function score(listing: BoardListing, tokens: string[], query: string): number[] | null {
  if (listing.choice.stationId.toLowerCase() === query) return [-1, 0, 0];
  let best: number[] | null = null;
  [listing.name, ...listing.alsoKnownAs].forEach((label, index) => {
    const match = matchLabel(tokens, label);
    if (!match) return;
    const candidate = [match.quality, match.typos, index === 0 ? 0 : 1];
    if (!best || compareScores(candidate, best) < 0) best = candidate;
  });
  return best;
}

function compareScores(a: number[], b: number[]): number {
  for (let index = 0; index < a.length; index++) {
    const difference = a[index]! - b[index]!;
    if (difference) return difference;
  }
  return 0;
}

/** Larger stations first, then by name so the order is stable. */
function byImportance(a: BoardListing, b: BoardListing): number {
  return b.routes.length - a.routes.length ||
    a.name.localeCompare(b.name) ||
    a.system.localeCompare(b.system);
}

/**
 * Every board, busiest first: what the picker lists before anything is typed.
 */
export const boardListingsByImportance: BoardListing[] = [...boardListings].sort(byImportance);

/**
 * Board choices from both systems in one ranked result set, best match first
 * (see `score`). Ties prefer boards serving more routes, so larger stations
 * appear first, and then break by name so results are stable. An empty query
 * returns nothing.
 */
export function searchBoardListings(query: string, limit = 40): BoardListing[] {
  const q = normalizeStationName(query);
  if (!q) return [];
  const tokens = [...new Set(q.split(" "))];

  return boardListings
    .map((listing) => ({ listing, score: score(listing, tokens, q) }))
    .filter((scored): scored is { listing: BoardListing; score: number[] } => scored.score !== null)
    .sort((a, b) => compareScores(a.score, b.score) || byImportance(a.listing, b.listing))
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
