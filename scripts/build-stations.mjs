/**
 * Regenerates lib/stations.json — the static rail station directory used for
 * search, the A-Z list, and nearest-station geolocation.
 *
 * It joins two sources, neither of which needs API credentials:
 *
 *   1. scripts/station-codes.json — station name -> STATION_2CHAR, transcribed
 *      from Appendix V of NJ Transit's RailData API manual. These are the codes
 *      the departures API expects.
 *   2. https://dv.njtransit.com/RailStationLabels.js — the public station data
 *      behind NJT's own rail map, giving coordinates and which lines serve each
 *      station.
 *
 * Only stations present in BOTH end up in the directory. That is deliberate: the
 * code table also lists off-network Amtrak destinations (Philadelphia, Baltimore,
 * Washington) that trains terminate at but which are not NJT rail stations, and
 * the join drops them.
 *
 * Run with: npm run build-stations
 */
import { writeFile, readFile } from "node:fs/promises";

const LABELS_URL = "https://dv.njtransit.com/RailStationLabels.js";

// Names that differ between the two sources.
const NAME_ALIASES = {
  "Montclair State University": "Montclair State U",
};

// Terminus entries carry extra keys between "line" and "name" (e.g. "start":"true"),
// and spacing is inconsistent, so allow arbitrary intervening keys. [^{}] keeps each
// match inside a single station object.
const STATION_RE =
  /"line":"(?<line>[^"]+)"[^{}]*?"name":"(?<name>[^"]+)"[^{}]*?"coordinates":\{"lat":(?<lat>-?[\d.]+),\s*"lng":(?<lng>-?[\d.]+)\}/g;

const codes = JSON.parse(
  await readFile(new URL("./station-codes.json", import.meta.url), "utf8"),
);

const res = await fetch(LABELS_URL);
if (!res.ok) throw new Error(`${LABELS_URL} returned ${res.status}`);
const js = await res.text();

const byName = new Map();
for (const m of js.matchAll(STATION_RE)) {
  const { line, name, lat, lng } = m.groups;
  const existing = byName.get(name);
  if (existing) {
    if (!existing.lines.includes(line)) existing.lines.push(line);
    continue;
  }
  byName.set(name, {
    name,
    lat: Number(lat),
    lng: Number(lng),
    lines: [line],
  });
}

const stations = [];
const missing = [];
for (const station of byName.values()) {
  const code = codes[NAME_ALIASES[station.name] ?? station.name];
  if (!code) {
    missing.push(station.name);
    continue;
  }
  stations.push({ code, ...station, lines: station.lines.sort() });
}

if (missing.length) {
  throw new Error(
    `No station code for: ${missing.join(", ")}. Add an alias to NAME_ALIASES ` +
      `or a new entry to station-codes.json.`,
  );
}

stations.sort((a, b) => a.name.localeCompare(b.name));

await writeFile(
  new URL("../lib/stations.json", import.meta.url),
  JSON.stringify(stations, null, 2) + "\n",
);

console.log(`Wrote ${stations.length} stations to lib/stations.json`);
