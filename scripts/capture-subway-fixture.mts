import { readFile, writeFile } from "node:fs/promises";
import { decodeFeedMessage, feedFieldSpans } from "../lib/gtfsRealtime";

/**
 * Trims a saved MTA feed to the trips that call at Times Sq-42 St on the
 * 1/2/3, keeping the header and those entities byte for byte as MTA sent them.
 * Usage: npx tsx scripts/capture-subway-fixture.mts <feed.pb> <output.pb>
 */
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: capture-subway-fixture.mts <feed.pb> <output.pb>");
const bytes = new Uint8Array(await readFile(input));
const fields = feedFieldSpans(bytes).map(({ field, start, end }) => ({ field, span: bytes.subarray(start, end) }));
const header = fields.find(({ field }) => field === 1)?.span;
if (!header) throw new Error("Captured feed has no header");
// An entity is decoded behind the header, since a feed must have one.
const callsAtTimesSquare = (entity: Uint8Array) =>
  decodeFeedMessage(Buffer.concat([header, entity])).entity.some((decoded) =>
    decoded.tripUpdate?.stopTimeUpdate.some((call) => call.stopId === "127N" || call.stopId === "127S"),
  );
const kept = fields.filter(({ field, span }) => field === 1 || (field === 2 && callsAtTimesSquare(span)));
if (!kept.some(({ field }) => field === 2)) throw new Error("Captured feed contains no Times Sq-42 St 1/2/3 trips");
await writeFile(output, Buffer.concat(kept.map(({ span }) => span)));
