import { readFile, writeFile } from "node:fs/promises";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: build-subway-headsigns.mjs <trips.txt> <output.json>");

const lines = (await readFile(input, "utf8")).trim().split(/\r?\n/);
const header = lines.shift().split(",");
const tripIndex = header.indexOf("trip_id");
const headsignIndex = header.indexOf("trip_headsign");
const routeIndex = header.indexOf("route_id");
const candidates = new Map();
for (const line of lines) {
  const row = line.split(",");
  if (!["1", "2", "3"].includes(row[routeIndex])) continue;
  const tripId = row[tripIndex];
  const realtimeId = tripId.match(/_(\d{6}_.+)$/)?.[1];
  if (!realtimeId) continue;
  const headsigns = candidates.get(realtimeId) ?? new Set();
  headsigns.add(row[headsignIndex]);
  candidates.set(realtimeId, headsigns);
}
const reliable = {};
for (const [tripId, headsigns] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
  if (headsigns.size === 1) reliable[tripId] = [...headsigns][0];
}
await writeFile(output, `${JSON.stringify(reliable, null, 2)}\n`);
