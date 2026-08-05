import { readFile, writeFile } from "node:fs/promises";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: build-subway-stops.mjs <stops.txt> <output.json>");

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
const idIndex = header.indexOf("stop_id");
const nameIndex = header.indexOf("stop_name");
const locationTypeIndex = header.indexOf("location_type");
const names = {};
for (const line of lines) {
  const row = fields(line);
  if (row[locationTypeIndex] === "1") names[row[idIndex]] = row[nameIndex];
}
await writeFile(output, `${JSON.stringify(names, null, 2)}\n`);
