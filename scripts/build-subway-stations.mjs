import { readFile, writeFile } from "node:fs/promises";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: build-subway-stations.mjs <stations.csv> <output.json>");

function fields(line) {
  const result = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { result.push(value); value = ""; }
    else value += char;
  }
  result.push(value);
  return result;
}

const lines = (await readFile(input, "utf8")).trim().split(/\r?\n/);
const header = fields(lines.shift());
const column = (name) => {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`Missing ${name} column`);
  return index;
};
const indexes = Object.fromEntries([
  "gtfs_stop_id", "complex_id", "stop_name", "daytime_routes", "gtfs_latitude",
  "gtfs_longitude", "north_direction_label", "south_direction_label",
].map((name) => [name, column(name)]));

const stations = lines.map((line) => {
  const row = fields(line);
  return {
    id: row[indexes.gtfs_stop_id],
    name: row[indexes.stop_name],
    complexId: row[indexes.complex_id],
    routes: row[indexes.daytime_routes].split(/\s+/).filter(Boolean),
    latitude: Number(row[indexes.gtfs_latitude]),
    longitude: Number(row[indexes.gtfs_longitude]),
    directions: {
      ...(row[indexes.north_direction_label] ? { N: row[indexes.north_direction_label] } : {}),
      ...(row[indexes.south_direction_label] ? { S: row[indexes.south_direction_label] } : {}),
    },
  };
}).sort((a, b) => a.id.localeCompare(b.id));

await writeFile(output, `${JSON.stringify(stations, null, 2)}\n`);
