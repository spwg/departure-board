import { readFile, writeFile } from "node:fs/promises";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: build-subway-transfers.mjs <transfers.txt> <output.json>");

const lines = (await readFile(input, "utf8")).trim().split(/\r?\n/).slice(1);
const transfers = lines
  .map((line) => line.split(","))
  .filter(([from, to]) => from && to && from !== to)
  .map(([from, to]) => [from, to]);

await writeFile(output, `${JSON.stringify(transfers)}\n`);
