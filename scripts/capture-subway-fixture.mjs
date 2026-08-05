import { readFile, writeFile } from "node:fs/promises";
import gtfsRealtimeBindings from "gtfs-realtime-bindings";

const { transit_realtime } = gtfsRealtimeBindings;

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: capture-subway-fixture.mjs <feed.pb> <output.pb>");
const feed = transit_realtime.FeedMessage.decode(await readFile(input));
const entity = feed.entity.filter((item) =>
  item.tripUpdate?.stopTimeUpdate?.some((call) => call.stopId === "127N" || call.stopId === "127S"),
);
if (entity.length === 0) throw new Error("Captured feed contains no 34 St-Penn 1/2/3 trips");
await writeFile(output, transit_realtime.FeedMessage.encode({ header: feed.header, entity }).finish());
